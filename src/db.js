import pg from "pg";

export const dbClient = new pg.Client(process.env.DATABASE_URL);

export async function fetchVerses(options) {
  const q = await dbClient.query(
    `SELECT
        word.verse_id AS id,
        JSON_AGG(
            JSON_BUILD_OBJECT(
                'id', word.id,
                'text', word.text,
                'targetGloss', target_gloss.gloss
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
    WHERE word.verse_id >= $1 AND word.verse_id <= $2
    GROUP BY word.verse_id
    ORDER BY word.verse_id;
    `,
    [options.start, options.end, options.target],
  );
  return q.rows;
}

export async function fetchRefGlosses(options) {
  const q = await dbClient.query(
    `SELECT
        word.verse_id AS id,
        JSON_AGG(
            JSON_BUILD_OBJECT(
                'id', word.id,
                'gloss', ref_gloss.gloss
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
    ) AS ref_gloss ON true
    WHERE word.verse_id >= $1 AND word.verse_id <= $2
    GROUP BY word.verse_id
    ORDER BY word.verse_id;
    `,
    [options.start, options.end, options.ref],
  );
  return q.rows;
}

export async function fetchLanguage(code) {
  const lang = await dbClient.query(
    `SELECT name FROM language WHERE code = $1`,
    [code],
  );
  return lang.rows[0];
}
