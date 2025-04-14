import "dotenv/config";
import yargs from "yargs";
import { googleTranslate } from "./models/google-translate.js";
import { gpt } from "./models/openai.js";
import { dbClient, fetchRefGlosses, fetchVerses } from "./db.js";

async function run() {
  await dbClient.connect();

  const args = parseArgs();
  const verses = await fetchVerses(args);
  const results = await Promise.all(
    args.experiments
      .filter((name) => experiments[name])
      .map(async (name) => experiments[name](args, verses)),
  );

  /*
  const english = await fetchRefGlosses({ ...args, ref: "eng" });
  const englishWords = english.flatMap((verse) => verse.words);
  const targetLang = await fetchRefGlosses({ ...args, ref: args.target });
  const targetWords = targetLang.flatMap((verse) => verse.words);
  */

  const csvData = verses
    .flatMap((verse) => verse.words)
    .map((word, i) =>
      // `${word.id},"${word.text}","${englishWords[i]?.gloss}",${targetWords[i]?.gloss},${results.map((r) => `"${r[i]}"`).join(",")}`,
      results.map((r) => `"${r[i]}"`).join(","),
    )
    .join("\n");

  console.log(`${args.experiments.join(",")}\n${csvData}`);
}

const experiments = {
  "gt-eng": googleTranslate("eng"),
  "gt-spa": googleTranslate("spa"),
  "gpt-verse-examples": gpt({
    ref: "eng",
    examples: "jonah",
  }),
};

function parseArgs() {
  const args = yargs(process.argv.slice(2))
    .options({
      target: {
        alias: "t",
        demandOption: true,
        describe: "target language code",
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

  return args;
}

try {
  await run();
} catch (error) {
  console.log(error);
} finally {
  dbClient.end();
}
