import OpenAI from "openai";
import { dbClient, fetchLanguage, fetchRefGlosses } from "../db.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY,
});

export function gpt(settings = {}) {
  return async function (options, verses) {
    if (settings.ref) {
      var refGlosses = await fetchRefGlosses(settings.ref);
    }

    const language = await fetchLanguage(options.target);
    const results = await Promise.all(
      verses.map(async (verse, i) => {
        const verseRefGlosses = refGlosses?.[i];
        const response = await openai.chat.completions.create({
          ...REQUEST_BASE,
          messages: [
            {
              role: "system",
              content: [
                {
                  type: "text",
                  text: SYSTEM_PROMPT.replaceAll(
                    "{languageName}",
                    language.name,
                  ),
                },
              ],
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: verse.words
                    .map(
                      (word, j) =>
                        `${word.id} ${word.text}${verseRefGlosses?.words[j] ? ` ${verseRefGlosses.words[j].gloss}` : ""}`,
                    )
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

const SYSTEM_PROMPT = `
You are a highly skilled language model tasked with producing interlinear glosses for a Hebrew Old Testament verse. Your role is to generate concise and accurate glosses for each individual Hebrew word in the verse, translating them into {languageName}. These glosses are meant to aid intermediate Hebrew students in understanding the meaning of the words in the context of the passage. Here are the specific guidelines and priorities for your task:
- Each gloss should reflect the literal meaning of the Hebrew word as closely as possible, but in a way that is brief and requires minimal mental processing for the student.
- Always choose the gloss that fits the context of the verse. Hebrew words can have different meanings based on their usage in different contexts.
- Avoid translating idiomatic meanings. This is not a translation of the verse into {langaugeName}. The goal is to help the student understand the Hebrew word as it is, even if it feels awkward or strange in the target language.
- Do not add punctuation like commas, periods, or question marks to the glosses. The glosses should be clean, without any punctuation, to avoid distorting the system’s functionality.
- If a word is untranslatable in {languageName}, use a single dash to indicate so. Do not use dashes in other cases like between words.
- For proper names (like people or places), use the standard transliteration in {languageName}, e.g., “David” or “Yeshua,” without providing their meaning (e.g., “beloved”).
- When glossing verbs, make sure to include the subject if it’s not clear from the conjugation in {languageName}. For example, if the Hebrew verb is "he went" (וַיֵּלֵךְ), gloss it as “and he went,” making the subject explicit.
- If {languageName} has grammatical gender, follow the standard gender for nouns in that language. Do not force the gloss to match the Hebrew gender if it does not align with the grammatical rules of the target language.
- If you encounter construct chains (e.g., “sons of Israel”), gloss the first noun with the construct form in {targetName} (e.g., “sons of”).
- Do not capitalize words except for when the target language convention requires capitalization (e.g., proper nouns, specific names of God like YHWH).
- Use square brackets only when necessary to add implied words for clarity (e.g., “was,” “and”). Avoid using brackets to add your interpretation.
- For complex or hard-to-translate Hebrew words (e.g., חֶסֶד), feel free to use two words if needed (e.g., "loyal love" or "faithful love") but always ensure that your choice is appropriate for the context.
- When there’s ambiguity in the meaning of a word, choose a gloss that fits the passage and context. If you are unsure, follow the guidelines for clarity over precision—aim for what will best serve the reader.
- If the Hebrew word has a definite article (הַ), and the target language doesn’t have a definite article, do not gloss it unless it’s necessary for understanding. Intermediate students should already be familiar with these distinctions.
`;

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
