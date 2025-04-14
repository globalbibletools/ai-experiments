import OpenAI from "openai";
import { fetchVersesWithRef, fetchLanguage, fetchRefGlosses } from "../db.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY,
});

export function gpt(settings = {}) {
  return async function (options, verses) {
    if (settings.ref) {
      var refGlosses = await fetchRefGlosses(settings);
    }

    let examples = [];
    if (settings.examples === "jonah") {
      if (settings.ref) {
        var exampleVerses = await fetchVersesWithRef({
          start: "32001001",
          end: "32001017",
          ref: settings.ref,
          target: options.target,
        });
      } else {
        var exampleVerses = await fetchVerses({
          start: "32001001",
          end: "32001017",
          target: options.target,
        });
      }

      examples = exampleVerses.flatMap((verse) => [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: verse.words
                .map(
                  (word) =>
                    `${word.id}, ${word.text}${word.refGloss ? `, ${word.refGloss}` : ""}`,
                )
                .join("\n"),
            },
          ],
        },
        {
          role: "assistant",
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  glosses: verse.words.map((word) => ({
                    id: word.id,
                    gloss: word.targetGloss,
                  })),
                },
                null,
                2,
              ),
            },
          ],
        },
      ]);
    }

    const language = await fetchLanguage(options.target);
    let results = [];

    for (const i in verses) {
      const verse = verses[i];
      const verseRefGlosses = refGlosses?.[i];
      const request = {
        ...REQUEST_BASE,
        messages: [
          {
            role: "system",
            content: [
              {
                type: "text",
                text: SYSTEM_PROMPT.replaceAll("{languageName}", language.name),
              },
            ],
          },
          ...examples,
          {
            role: "user",
            content: [
              {
                type: "text",
                text: verse.words
                  .map(
                    (word, j) =>
                      `${word.id}, ${word.text}${verseRefGlosses?.words[j] ? `, ${verseRefGlosses.words[j].gloss}` : ""}`,
                  )
                  .join("\n"),
              },
            ],
          },
        ],
      };
      console.log(JSON.stringify(request, null, 2));
      const response = await openai.chat.completions.create(request);

      // To avoid rate limits.
      await new Promise((resolve) => setTimeout(resolve, 200));

      const result = JSON.parse(response.choices[0].message.content ?? "{}");
      for (const word of verse.words) {
        results.push(result.glosses.find((g) => g.id === word.id)?.gloss ?? "");
      }
    }

    return results.flatMap((result) => result);
  };
}

const SYSTEM_PROMPT = `You are producing glosses in {languageName} for the Biblical text so that a {languageName} speaker can understand the Hebrew text. Please use the following guidelines when translating glosses. Each gloss should help the reader understand the meaning of the word in the context of the sentence. Please output your response as a JSON list of ids and glosses`;

const REQUEST_BASE = {
  model: "gpt-4o",
  messages: [],
  response_format: {
    type: "json_schema",
    json_schema: {
      name: "gloss_list",
      schema: {
        type: "object",
        properties: {
          glosses: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                },
                gloss: {
                  type: "string",
                },
              },
              required: ["id", "gloss"],
              additionalProperties: false,
            },
          },
        },
      },
    },
  },
  temperature: 1,
  max_completion_tokens: 2048,
  top_p: 1,
  frequency_penalty: 0,
  presence_penalty: 0,
};
