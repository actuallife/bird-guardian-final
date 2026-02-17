// --- 🔥 修改後的上傳與辨識邏輯 (容錯版) ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    
    setUploading(true);
    setAiAnalyzing(true); // 開始轉圈圈

    try {
      // 1. 上傳到 Supabase Storage (這步通常是成功的)
      const fileName = `${Math.random()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage.from('bird-photos').upload(fileName, file);
      
      if (uploadError) {
        throw new Error('照片上傳失敗: ' + uploadError.message);
      }
      
      // 取得照片網址
      const { data: urlData } = supabase.storage.from('bird-photos').getPublicUrl(fileName);
      setFormData(prev => ({ ...prev, photo_url: urlData.publicUrl }));

      // 2. 嘗試呼叫 Gemini AI (把它包在獨立的 try-catch 中)
      try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const imagePart = await fileToGenerativePart(file);
        
        const prompt = "這是一張鳥類的照片。請辨識這是什麼鳥？請只回傳「鳥的中文名稱」以及你對這個判斷的「信心度(0-100%)」。格式請用：鳥名 (信心度)。例如：五色鳥 (95%)。如果照片不是鳥，請回傳：無法辨識 (非鳥類)。";
        
        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const aiText = response.text();
        
        // AI 成功：填入 AI 的答案
        setFormData(prev => ({ ...prev, bird_species: aiText.trim() }));
      
      } catch (aiError: any) {
        // ⚠️ AI 失敗了，但我們不要崩潰！
        console.error("Gemini AI 辨識失敗:", aiError);
        // 改成填入預設文字，讓使用者自己改
        setFormData(prev => ({ ...prev, bird_species: "辨識連線失敗 (請手動輸入)" }));
        alert("AI 辨識連線發生問題，請稍後手動輸入鳥種名稱。\n(照片已上傳成功)");
      }

      // 3. 無論 AI 成功或失敗，都讓使用者進入下一步！
      setUploading(false);
      setAiAnalyzing(false);
      setStep(2); // 跳轉到確認頁面 (關鍵！)

    } catch (error: any) {
      // 只有照片上傳失敗這種嚴重錯誤，才完全擋下來
      console.error(error);
      alert('發生嚴重錯誤：' + error.message);
      setUploading(false);
      setAiAnalyzing(false);
    }
  };
