# AI Experiments for Global Bible Tools

## Usage

Create an `.env` file with the following env vars:

- `DATABASE_URL` - PSQL connection string to database with gloss data
- `OPENAPI_KEY` - The API key for making requests to the GPT model from OpenAI
- `GOOGLE_TRANSLATE_CREDENTIALS` - The API key for access the Google Translate API

Run the script with the experiments you want to run:

```bash
node src/index.js --target=pol --ref=spa --start=01001001 --end=01001005 --experiments=experiment-1,experiment-2
```

Short hand:

```bash
node src/index.js -t=pol -r=spa -s=01001001 -e=01001005 -x=experiment-1,experiment-2
```

## Experiment spec:

- `targetLanguage` - The 3 digit code of the language to translate to
- `refLanguage` (Optional) - The 3 digit code of the reference language. Not all experiments use this
- `startVerse` - The ID of the verse that starts the passage to be translated
- `endVerse` - The ID of the verse that ends the passage to be translated (inclusive)
