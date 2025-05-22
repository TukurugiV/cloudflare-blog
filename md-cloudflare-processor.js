#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const FormData = require('form-data');
require('dotenv').config();

// コマンドライン引数の処理
const args = process.argv.slice(2);
let inputDir = '';
let outputDir = '';
let overwriteInput = true;
let skipImageReplace = false;
let skipJsonGeneration = false;

// ヘルプメッセージの表示
if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
  console.log(`
md-cloudflare-processor - Markdownファイル内のローカル画像をCloudflare Imagesにアップロードし、JSONファイルを生成するツール

使用方法: md-cloudflare-processor [オプション]

オプション:
  -i, --input <dir>      処理するMarkdownファイルのあるディレクトリのパス (必須)
  -o, --output <dir>     出力先ディレクトリ (省略可能、デフォルトは入力ファイルを上書き)
  -n, --no-overwrite    入力ファイルを上書きせず、代わりに <input>_updated<ext> を作成
  --skip-images         画像のアップロードと置換をスキップ
  --skip-json           JSONファイルの生成をスキップ
  -h, --help            このヘルプメッセージを表示

環境変数:
  CLOUDFLARE_ACCOUNT_ID   Cloudflareアカウント識別子 (画像処理に必須)
  CLOUDFLARE_API_TOKEN    CloudflareのAPIトークン (画像処理に必須)

例:
  md-cloudflare-processor -i ./                    # カレントディレクトリの全Markdownファイルを処理
  md-cloudflare-processor -i ./ -o ./processed/    # 処理結果を別のディレクトリに保存
  md-cloudflare-processor -i ./ --skip-images      # JSONファイルの生成のみ実行
  md-cloudflare-processor -i ./ --skip-json        # 画像の置換のみ実行
  `);
  process.exit(args.includes('-h') || args.includes('--help') ? 0 : 1);
}

// 引数の解析
for (let i = 0; i < args.length; i++) {
  if (args[i] === '-i' || args[i] === '--input') {
    inputDir = args[i + 1];
    i++;
  } else if (args[i] === '-o' || args[i] === '--output') {
    outputDir = args[i + 1];
    overwriteInput = false;
    i++;
  } else if (args[i] === '-n' || args[i] === '--no-overwrite') {
    overwriteInput = false;
  } else if (args[i] === '--skip-images') {
    skipImageReplace = true;
  } else if (args[i] === '--skip-json') {
    skipJsonGeneration = true;
  }
}

// 入力ディレクトリが指定されていることを確認
if (!inputDir) {
  console.error('エラー: 入力ディレクトリが指定されていません。-i または --input オプションを使用してください。');
  process.exit(1);
}

// 入力ディレクトリが存在することを確認
if (!fs.existsSync(inputDir)) {
  console.error(`エラー: 入力ディレクトリ "${inputDir}" が見つかりません。`);
  process.exit(1);
}

// Cloudflare Images API設定（画像処理をスキップしない場合のみ必要）
let CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CLOUDFLARE_IMAGES_API;

if (!skipImageReplace) {
  CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
  CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

  if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
    console.error('エラー: CloudflareのアカウントIDとAPIトークンが必要です。環境変数を設定してください：');
    console.error('  export CLOUDFLARE_ACCOUNT_ID="あなたのアカウントID"');
    console.error('  export CLOUDFLARE_API_TOKEN="あなたのAPIトークン"');
    console.error('または --skip-images オプションを使用して画像処理をスキップしてください。');
    process.exit(1);
  }

  CLOUDFLARE_IMAGES_API = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/images/v1`;
}

// 画像をCloudflare Imagesにアップロードする関数
async function uploadImageToCloudflare(imagePath) {
  try {
    const formData = new FormData();
    formData.append('file', fs.createReadStream(imagePath));
    
    const response = await fetch(CLOUDFLARE_IMAGES_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`
      },
      body: formData
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(`アップロード失敗: ${JSON.stringify(data.errors)}`);
    }
    
    return data.result.variants[0]; // 最初のバリアントURLを返す
  } catch (error) {
    console.error(`画像 ${imagePath} のアップロードエラー:`, error);
    throw error;
  }
}

// ディレクトリ内のMarkdownファイルを再帰的に検索する関数
function findMarkdownFiles(dir) {
  let results = [];
  const files = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    
    if (file.isDirectory()) {
      // 再帰的にディレクトリを処理
      results = results.concat(findMarkdownFiles(fullPath));
    } else if (file.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  
  return results;
}

// Markdownファイルを処理する関数（画像置換）
async function processMarkdownFile(inputFilePath, outputFilePath) {
  console.log(`画像処理を開始: ${inputFilePath}`);
  
  const markdownContent = fs.readFileSync(inputFilePath, 'utf8');
  const markdownDir = path.dirname(inputFilePath);
  
  // 画像パターンを検出するための正規表現
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  
  // 置換処理のためにPromiseを保持する配列
  const replacementPromises = [];
  const replacements = [];
  
  // すべての画像パターンを見つける
  let match;
  while ((match = imageRegex.exec(markdownContent)) !== null) {
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
    
    console.log(`画像を処理中: ${absoluteImagePath}`);
    
    // アップロード処理のPromiseを作成
    const uploadPromise = uploadImageToCloudflare(absoluteImagePath)
      .then(cloudflareUrl => {
        console.log(`アップロード成功: ${absoluteImagePath} → ${cloudflareUrl}`);
        replacements.push({
          original: fullMatch,
          replacement: `![${altText}](${cloudflareUrl})`
        });
      })
      .catch(error => {
        console.error(`画像 ${absoluteImagePath} の処理に失敗:`, error);
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

// フロントマターを解析する関数
function parseFrontMatter(content) {
  const frontMatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontMatterMatch) {
    return {};
  }

  const frontMatterContent = frontMatterMatch[1];
  const metadata = {};
  
  const lines = frontMatterContent.split(/\r?\n/);
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i].trim();
    
    if (!line) {
      i++;
      continue;
    }
    
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      i++;
      continue;
    }
    
    const key = line.substring(0, colonIndex).trim();
    let value = line.substring(colonIndex + 1).trim();
    
    // 配列の処理
    if (value === '[') {
      const arrayItems = [];
      i++;
      
      while (i < lines.length) {
        const arrayLine = lines[i].trim();
        if (arrayLine === ']') {
          i++;
          break;
        }
        if (arrayLine && arrayLine !== ',') {
          let item = arrayLine.replace(/^["']|["']$/g, '').replace(/,$/, '');
          if (item) {
            arrayItems.push(item);
          }
        }
        i++;
      }
      metadata[key] = arrayItems;
      continue;
    } else if (value.startsWith('[') && value.endsWith(']')) {
      const arrayContent = value.slice(1, -1).trim();
      if (arrayContent) {
        const items = arrayContent.split(',').map(item => {
          return item.trim().replace(/^["']|["']$/g, '');
        }).filter(item => item);
        metadata[key] = items;
      } else {
        metadata[key] = [];
      }
    } else {
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1);
      }
      metadata[key] = value;
    }
    
    i++;
  }
  
  return metadata;
}

// Markdownファイルを処理する関数（メタデータ抽出）
function extractMarkdownMetadata(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    console.log(`メタデータ抽出: ${filePath}`);
    
    const frontMatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontMatterMatch) {
      console.log(`  フロントマターが見つかりません: ${filePath}`);
      return {
        fileName: path.basename(filePath, '.md')
      };
    }
    
    const metadata = parseFrontMatter(content);
    const fileName = path.basename(filePath, '.md');
    
    return {
      fileName,
      ...metadata
    };
  } catch (error) {
    console.error(`ファイル ${filePath} の処理エラー:`, error);
    return null;
  }
}

// 特定フォルダ内のMarkdownファイルを取得する関数
function getMarkdownFilesInFolder(folderPath) {
  if (!fs.existsSync(folderPath)) {
    return [];
  }

  const files = fs.readdirSync(folderPath);
  return files
    .filter(file => file.endsWith('.md'))
    .map(file => path.join(folderPath, file));
}

// カテゴリーの統計を計算する関数
function calculateCategoryStats(markdownData) {
  const categoryCount = {};

  markdownData.forEach(item => {
    if (item && item.category && Array.isArray(item.category)) {
      item.category.forEach(cat => {
        if (cat) {
          categoryCount[cat] = (categoryCount[cat] || 0) + 1;
        }
      });
    }
  });

  return Object.entries(categoryCount).map(([category, count]) => ({
    category,
    count
  }));
}

// JSONファイルを生成する関数
function generateJsonFiles() {
  console.log('\n=== JSONファイル生成を開始 ===');
  
  const folders = ['events', 'news', 'posts'];
  
  folders.forEach(folder => {
    const folderPath = path.join(inputDir, folder);
    const markdownFiles = getMarkdownFilesInFolder(folderPath);
    
    if (markdownFiles.length === 0) {
      console.log(`${folder} フォルダにMarkdownファイルが見つかりませんでした`);
      return;
    }

    const markdownData = markdownFiles
      .map(extractMarkdownMetadata)
      .filter(data => data !== null);

    // 各フォルダのJSONファイルを生成
    const outputPath = path.join(inputDir, `${folder}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(markdownData, null, 2), 'utf8');
    console.log(`生成: ${outputPath} (${markdownData.length} エントリ)`);

    // postsフォルダの場合はカテゴリー統計も生成
    if (folder === 'posts') {
      const categoryStats = calculateCategoryStats(markdownData);
      const categoryOutputPath = path.join(inputDir, 'posts-categories.json');
      fs.writeFileSync(categoryOutputPath, JSON.stringify(categoryStats, null, 2), 'utf8');
      console.log(`生成: ${categoryOutputPath} (${categoryStats.length} カテゴリ)`);
    }
  });

  console.log('JSONファイル生成完了!');
}

// メイン処理の実行
async function main() {
  try {
    let totalImagesReplaced = 0;

    // 画像置換処理
    if (!skipImageReplace) {
      console.log('=== 画像置換処理を開始 ===');
      
      // 処理対象ファイルのリストを取得
      const filesToProcess = findMarkdownFiles(inputDir);
      
      if (filesToProcess.length === 0) {
        console.log('処理対象のMarkdownファイルが見つかりませんでした。');
      } else {
        console.log(`処理対象ファイル数: ${filesToProcess.length}`);
        
        // 各ファイルを順番に処理
        for (const filePath of filesToProcess) {
          let outputFilePath;
          
          if (outputDir) {
            // 出力ディレクトリが指定されている場合
            const relativePath = path.relative(inputDir, filePath);
            outputFilePath = path.join(outputDir, relativePath);
          } else if (!overwriteInput) {
            // 上書きしない場合は _updated サフィックスを付ける
            const ext = path.extname(filePath);
            const base = path.basename(filePath, ext);
            const dir = path.dirname(filePath);
            outputFilePath = path.join(dir, `${base}_updated${ext}`);
          } else {
            // 上書きする場合
            outputFilePath = filePath;
          }
          
          const replacedCount = await processMarkdownFile(filePath, outputFilePath);
          totalImagesReplaced += replacedCount;
        }
        
        console.log(`画像置換処理が完了しました。置換した画像の総数: ${totalImagesReplaced}`);
      }
    } else {
      console.log('画像置換処理をスキップしました。');
    }

    // JSONファイル生成処理
    if (!skipJsonGeneration) {
      generateJsonFiles();
    } else {
      console.log('JSONファイル生成をスキップしました。');
    }

    console.log('\n=== 全ての処理が完了しました ===');
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  }
}

// スクリプトを実行
main();