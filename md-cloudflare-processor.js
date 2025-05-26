// Markdownファイルを処理する関数（画像置換）- 改良版
async function processMarkdownFile(inputFilePath, outputFilePath) {
  console.log(`画像処理を開始: ${inputFilePath}`);
  
  const markdownContent = fs.readFileSync(inputFilePath, 'utf8');
  const markdownDir = path.dirname(inputFilePath);
  
  // フロントマターと本文を分離
  const frontMatterMatch = markdownContent.match(/^(---\r?\n[\s\S]*?\r?\n---)([\s\S]*)$/);
  let frontMatter = '';
  let bodyContent = markdownContent;
  
  if (frontMatterMatch) {
    frontMatter = frontMatterMatch[1];
    bodyContent = frontMatterMatch[2];
  }
  
  // 置換処理のためにPromiseを保持する配列
  const replacementPromises = [];
  const replacements = [];
  
  // 1. フロントマター内の画像フィールドを処理
  if (frontMatter) {
    console.log('フロントマター内の画像を処理中...');
    
    // coverImage, image, thumbnail などの画像フィールドを検出
    const imageFieldRegex = /(coverImage|image|thumbnail|hero|banner):\s*["']?([^"'\n\r]+)["']?/gi;
    
    let fieldMatch;
    while ((fieldMatch = imageFieldRegex.exec(frontMatter)) !== null) {
      const [fullMatch, fieldName, imagePath] = fieldMatch;
      
      // 外部URLの場合はスキップ
      if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
        console.log(`既にURLのため処理をスキップ: ${imagePath}`);
        continue;
      }
      
      // 相対パスを絶対パスに変換
      const absoluteImagePath = path.isAbsolute(imagePath) 
        ? imagePath 
        : path.resolve(markdownDir, imagePath);
      
      // ファイルが存在するか確認
      if (!fs.existsSync(absoluteImagePath)) {
        console.warn(`警告: 画像ファイルが見つかりません: ${absoluteImagePath}`);
        continue;
      }
      
      console.log(`フロントマター画像を処理中: ${fieldName}: ${absoluteImagePath}`);
      
      // アップロード処理のPromiseを作成
      const uploadPromise = uploadImageToCloudflare(absoluteImagePath)
        .then(cloudflareUrl => {
          console.log(`フロントマターアップロード成功: ${absoluteImagePath} → ${cloudflareUrl}`);
          replacements.push({
            original: fullMatch,
            replacement: `${fieldName}: "${cloudflareUrl}"`
          });
        })
        .catch(error => {
          console.error(`フロントマター画像 ${absoluteImagePath} の処理に失敗:`, error);
        });
      
      replacementPromises.push(uploadPromise);
    }
  }
  
  // 2. Markdown本文内の画像記法を処理
  console.log('Markdown本文内の画像を処理中...');
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  
  let match;
  while ((match = imageRegex.exec(bodyContent)) !== null) {
    const [fullMatch, altText, imagePath] = match;
    
    // 外部URLの場合はスキップ
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      console.log(`既にURLのため処理をスキップ: ${imagePath}`);
      continue;
    }
    
    // 相対パスを絶対パスに変換
    const absoluteImagePath = path.isAbsolute(imagePath) 
      ? imagePath 
      : path.resolve(markdownDir, imagePath);
    
    // ファイルが存在するか確認
    if (!fs.existsSync(absoluteImagePath)) {
      console.warn(`警告: 画像ファイルが見つかりません: ${absoluteImagePath}`);
      continue;
    }
    
    console.log(`Markdown画像を処理中: ${absoluteImagePath}`);
    
    // アップロード処理のPromiseを作成
    const uploadPromise = uploadImageToCloudflare(absoluteImagePath)
      .then(cloudflareUrl => {
        console.log(`Markdownアップロード成功: ${absoluteImagePath} → ${cloudflareUrl}`);
        replacements.push({
          original: fullMatch,
          replacement: `![${altText}](${cloudflareUrl})`
        });
      })
      .catch(error => {
        console.error(`Markdown画像 ${absoluteImagePath} の処理に失敗:`, error);
      });
    
    replacementPromises.push(uploadPromise);
  }
  
  // すべてのアップロードが完了するのを待つ
  await Promise.all(replacementPromises);
  
  // 置換を実行
  let updatedContent = markdownContent;
  replacements.forEach(({ original, replacement }) => {
    updatedContent = updatedContent.replace(original, replacement);
  });
  
  // 出力ディレクトリが存在しない場合は作成
  const outputDirPath = path.dirname(outputFilePath);
  if (!fs.existsSync(outputDirPath)) {
    fs.mkdirSync(outputDirPath, { recursive: true });
  }
  
  // 更新されたMarkdownを保存
  fs.writeFileSync(outputFilePath, updatedContent, 'utf8');
  
  if (inputFilePath === outputFilePath) {
    console.log(`画像処理完了. 入力ファイルを上書き: ${outputFilePath}`);
  } else {
    console.log(`画像処理完了. 更新されたMarkdownを保存: ${outputFilePath}`);
  }
  
  return replacements.length;
}
