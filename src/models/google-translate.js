import { TranslationServiceClient } from "@google-cloud/translate";
import localeMap from "../locale-mapping.json" with { type: "json" };
import { dbClient, fetchRefGlosses } from "../db.js";

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

export function googleTranslate(ref) {
  return async function (options, verses) {
    const refGlosses = await fetchRefGlosses({ ...options, ref });
    const [response] = await googleClient.translateText({
      contents: refGlosses.flatMap((verse) =>
        verse.words.map((word) => word.gloss),
      ),
      targetLanguageCode: localeMap[options.target],
      sourceLanguageCode: localeMap[options.refLang],
      parent: `projects/${googleKey.project_id}`,
    });
    return response.translations.map((t) => t.translatedText);
  };
}
