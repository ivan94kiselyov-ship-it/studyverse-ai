export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({error:"Разрешён только POST"});
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({error:"Не настроен GEMINI_API_KEY в Vercel"});
  const {text,language="ru",task="summary"}=req.body||{};
  if(typeof text!=="string"||text.trim().length<30||text.length>20000)
    return res.status(400).json({error:"Текст должен содержать от 30 до 20000 символов"});
  const languageName=language==="kz"?"казахском":"русском";
  const isQuiz=task==="quiz";
  const isFlashcards=task==="flashcards";
  const prompt=isFlashcards
    ? `Создай ровно 8 двусторонних учебных карточек по тексту ниже на ${languageName} языке. Каждая карточка содержит короткий вопрос или термин на лицевой стороне и ясный, точный ответ на обратной. Не выдумывай фактов. Верни только JSON: {"cards":[{"question":"...","answer":"..."}]}. Все ответы должны быть полезными для запоминания.\n\n${text}`
    : isQuiz
    ? `Создай ровно 5 учебных вопросов на ${languageName} языке строго по тексту ниже. Для каждого вопроса ровно 4 разных варианта, один правильный, краткое объяснение. Верни только JSON в формате {"questions":[{"question":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"..."}]}. correctIndex — целое число от 0 до 3. Не добавляй фактов, которых нет в тексте.\n\n${text}`
    : `Ты — STUDYVERSE AI. Подготовь конспект на ${languageName} языке. Структура: тема, главная мысль, ключевые понятия, тезисы, примеры из текста, вывод и 5 вопросов для самопроверки. Не выдумывай факты. Без приветствия.\n\n${text}`;
  try{
    const generationConfig={temperature:0.3,maxOutputTokens:isQuiz?2400:1800};
    if(isQuiz||isFlashcards)generationConfig.responseMimeType="application/json";
    const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",{
      method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":process.env.GEMINI_API_KEY},
      body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)return res.status(response.status).json({error:data?.error?.message||"Ошибка Gemini API"});
    const result=data?.candidates?.[0]?.content?.parts?.map(x=>x.text||"").join("\n").trim();
    if(!result)return res.status(502).json({error:"Gemini не вернул текст"});
    if(!isQuiz&&!isFlashcards)return res.status(200).json({result});
    if(isFlashcards){
      let flashcards;
      try{flashcards=JSON.parse(result.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/, ""))}
      catch{return res.status(502).json({error:"Gemini вернул карточки в неверном формате"})}
      if(!Array.isArray(flashcards.cards)||flashcards.cards.length!==8||
         flashcards.cards.some(c=>typeof c.question!=="string"||!c.question.trim()||typeof c.answer!=="string"||!c.answer.trim()))
        return res.status(502).json({error:"Карточки получились неполными, попробуй ещё раз"});
      return res.status(200).json({flashcards});
    }
    let quiz;
    try{quiz=JSON.parse(result.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,""))}
    catch{return res.status(502).json({error:"Gemini вернул некорректный JSON"})}
    if(!Array.isArray(quiz.questions)||quiz.questions.length!==5||
      quiz.questions.some(q=>typeof q.question!=="string"||!Array.isArray(q.options)||
      q.options.length!==4||q.options.some(x=>typeof x!=="string")||
      !Number.isInteger(q.correctIndex)||q.correctIndex<0||q.correctIndex>3||
      typeof q.explanation!=="string"))
      return res.status(502).json({error:"Тест получился неполным, попробуй ещё раз"});
    return res.status(200).json({quiz});
  }catch{return res.status(500).json({error:"Ошибка сервера"})}
}
