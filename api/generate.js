export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Разрешён только POST-запрос." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "На сервере не настроен GEMINI_API_KEY. Добавь его в Vercel → Settings → Environment Variables."
    });
  }

  try {
    const { text, language = "ru", task = "summary" } = req.body || {};

    if (typeof text !== "string" || text.trim().length < 30) {
      return res.status(400).json({ error: "Добавь учебный текст длиной не менее 30 символов." });
    }

    if (text.length > 20000) {
      return res.status(413).json({ error: "Для первой версии ограничение — 20 000 символов." });
    }

    const outputLanguage = language === "kz" ? "казахском" : "русском";
    const prompt = task === "summary"
      ? `Ты — учебный помощник STUDYVERSE AI. Подготовь понятный, точный и полезный учебный конспект на ${outputLanguage} языке по материалу ниже. Структура: 1) Тема и главная мысль; 2) Ключевые понятия с объяснениями; 3) Основные тезисы; 4) Примеры (только если они есть в материале); 5) Краткий вывод; 6) Пять вопросов для самопроверки. Не выдумывай факты, которых нет в исходном материале. Используй заголовки и списки.\n\nУЧЕБНЫЙ МАТЕРИАЛ:\n${text}`
      : `Ты — учебный помощник STUDYVERSE AI. Ответь на ${outputLanguage} языке по материалу:\n${text}`;

    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 1800
          }
        })
      }
    );

    const payload = await geminiResponse.json().catch(() => ({}));

    if (!geminiResponse.ok) {
      const googleMessage = payload?.error?.message || "Google Gemini API вернул ошибку.";
      return res.status(geminiResponse.status).json({ error: googleMessage });
    }

    const result = payload?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("\n")
      .trim();

    if (!result) {
      return res.status(502).json({ error: "Gemini не вернул текст. Попробуй ещё раз." });
    }

    return res.status(200).json({ result });
  } catch (error) {
    return res.status(500).json({ error: "Ошибка сервера. Попробуй ещё раз." });
  }
}
