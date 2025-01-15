import "dotenv/config";
import yargs from "yargs";
import pg from "pg";
import OpenAI from "openai";
import { TranslationServiceClient } from "@google-cloud/translate";
import localeMap from "./locale-mapping.json" with { type: "json" };

async function run() {
  await dbClient.connect();

  const args = parseArgs();
  const verses = await fetchVerse(args);
  const results = await Promise.all(
    args.experiments
      .filter((name) => experiments[name])
      .map(async (name) => experiments[name](args, verses)),
  );

  const csvData = verses
    .flatMap((verse) => verse.words)
    .map((word, i) => `${word.id},${results.map((r) => `"${r[i]}"`).join(",")}`)
    .join("\n");

  console.log(`,${args.experiments.join(",")}\n${csvData}`);
}

const googleKey = process.env.GOOGLE_TRANSLATE_CREDENTIALS
  ? JSON.parse(
      Buffer.from(process.env.GOOGLE_TRANSLATE_CREDENTIALS, "base64").toString(
        "utf8",
      ),
    )
  : undefined;
const googleClient = new TranslationServiceClient({
  credentials: {
    client_email: googleKey.client_email,
    private_key: googleKey.private_key,
  },
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY,
});

const dbClient = new pg.Client(process.env.DATABASE_URL);

const experiments = {
  "google-translate": googleTranslate,
  "gpt-standards": configureGPT(),
};

function configureGPT(settings) {
  return async function (options, verses) {
    const lang = await dbClient.query(
      `SELECT name FROM language WHERE code = $1`,
      [options.target],
    );
    const languageName = lang.rows[0].name;

    const results = await Promise.all(
      verses.map(async (verse) => {
        const response = await openai.chat.completions.create({
          ...REQUEST_BASE,
          messages: [
            {
              role: "system",
              content: [
                {
                  type: "text",
                  text: SYSTEM_PROMPT.replace("{languageName}", languageName),
                },
              ],
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: verse.words
                    .map((word) => `${word.id} ${word.text} - ${word.refGloss}`)
                    .join("\n"),
                },
              ],
            },
          ],
        });

        const result = JSON.parse(response.choices[0].message.content ?? "{}");
        return result.translations.map((t) => t.translation);
      }),
    );

    return results.flatMap((result) => result);
  };
}

const SYSTEM_PROMPT = `You are going to be producing literal translations in {languageName} for individual words in the Hebrew Old Testament and Greek New Testament. I will give you a list of individual Hebrew or Greek words in order from the text with the ID you should use when outputting the translation and an example in English. The translation for each word should meet the following criteria:
- For Hebrew and Greek words with multiple translations, use context clues to determine which sense is most appropriate. When in doubt err on the side of literalness.
- Try to follow the grammar of the Hebrew and Greek word in the translation. For example, conjugate verbs, and match plurals for nouns and adjectives
- Transliterate proper nouns so their pronunciation is close.
- When a Hebrew or Greek word is untranslatable, use a single hyphen as the translation.
- In inflected languages, the translation should adjust the translation based on where the word is in the sentence
- Punctuation in Hebrew or Greek should not be translated`;

const REQUEST_BASE = {
  model: "gpt-4o-mini",
  messages: [],
  response_format: {
    type: "json_schema",
    json_schema: {
      name: "translations_array",
      strict: true,
      schema: {
        type: "object",
        properties: {
          translations: {
            type: "array",
            description: "An array of translation objects.",
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "The unique identifier for the translation.",
                },
                translation: {
                  type: "string",
                  description: "The translation text.",
                },
              },
              required: ["id", "translation"],
              additionalProperties: false,
            },
          },
        },
        required: ["translations"],
        additionalProperties: false,
      },
    },
  },
  temperature: 1,
  max_completion_tokens: 2048,
  top_p: 1,
  frequency_penalty: 0,
  presence_penalty: 0,
};

async function googleTranslate(options, verses) {
  const [response] = await googleClient.translateText({
    contents: verses.flatMap((verse) =>
      verse.words.map((word) => word.refGloss),
    ),
    targetLanguageCode: localeMap[options.target],
    sourceLanguageCode: localeMap[options.ref],
    parent: `projects/${googleKey.project_id}`,
  });
  return response.translations.map((t) => t.translatedText);
}

async function fetchVerse(options) {
  const q = await dbClient.query(
    `SELECT
        word.verse_id AS id,
        JSON_AGG(
            JSON_BUILD_OBJECT(
                'id', word.id,
                'text', word.text,
                'targetGloss', target_gloss.gloss,
                'refGloss', ref_gloss.gloss
            )
            ORDER BY word.id
        ) AS words
    FROM word
    LEFT JOIN LATERAL (
        SELECT gloss.gloss FROM gloss
        WHERE EXISTS (
            SELECT FROM phrase_word phw
            JOIN phrase ON phrase.id = phw.phrase_id
            WHERE phw.word_id = word.id
                AND phrase.language_id = (SELECT id FROM language WHERE code = $3)
                AND phrase.deleted_at IS NULL
                AND gloss.phrase_id = phrase.id
        )
    ) AS target_gloss ON true
    LEFT JOIN LATERAL (
        SELECT gloss.gloss FROM gloss
        WHERE EXISTS (
            SELECT FROM phrase_word phw
            JOIN phrase ON phrase.id = phw.phrase_id
            WHERE phw.word_id = word.id
                AND phrase.language_id = (SELECT id FROM language WHERE code = $4)
                AND phrase.deleted_at IS NULL
                AND gloss.phrase_id = phrase.id
        )
    ) AS ref_gloss ON true
    WHERE word.verse_id >= $1 AND word.verse_id <= $2
    GROUP BY word.verse_id
    ORDER BY word.verse_id;
    `,
    [options.start, options.end, options.target, options.ref],
  );
  return q.rows;
}

function parseArgs() {
  const args = yargs(process.argv.slice(2))
    .options({
      target: {
        alias: "t",
        demandOption: true,
        describe: "target language code",
        type: "string",
      },
      ref: {
        alias: "r",
        describe: "reference language code",
        type: "string",
      },
      start: {
        alias: "s",
        demandOption: true,
        describe: "start verse ID",
        type: "string",
      },
      end: {
        alias: "e",
        describe: "end verse ID",
        type: "string",
      },
      experiments: {
        alias: "x",
        demandOption: true,
        describe: "list of experiments to run",
        type: "array",
      },
    })
    .parseSync();

  if (!args.end) {
    args.end = args.start;
  }
  if (!args.ref) {
    args.ref = "eng";
  }

  return args;
}

try {
  await run();
} catch (error) {
  console.log(error);
} finally {
  dbClient.end();
}
