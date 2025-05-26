#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const FormData = require('form-data');
require('dotenv').config()

// コマンドライン引数の処理
const args = process.argv.slice(2);
let inputPath = '';
let outputDir = '';
let overwriteInput = true; // デフォルトで入力ファイルを上書き
let recursive = false;     // デフォルトでは再帰的に処理しない
let filePattern = '**/*.md'; // デフォルトでmd拡張子のみ

// ヘルプメッセージの表示
if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
  console.log(`
md-cloudflare-images - Markdownファイル内のローカル画像をCloudflare Imagesにアップロードして置き換えるツール

使用方法: md-cloudflare-images [オプション]

オプション:
  -i, --input <path>     処理するMarkdownファイルまたはディレクトリのパス (必須)
  -o, --output <dir>     出力先ディレクトリ (省略可能、デフォルトは入力ファイルを上書き)
  -n, --no-overwrite     入力ファイルを上書きせず、代わりに <input>_updated<ext> を作成
  -r, --recursive        ディレクトリを再帰的に処理
  -p, --pattern <glob>   処理するファイルのパターン (デフォルト: "**/*.md")
  -h, --help             このヘルプメッセージを表示

環境変数:
  CLOUDFLARE_ACCOUNT_ID   Cloudflareアカウント識別子 (必須)
  CLOUDFLARE_API_TOKEN    CloudflareのAPIトークン (必須)

例:
  md-cloudflare-images -i ./document.md                # 単一ファイルを処理して上書き
  md-cloudflare-images -i ./docs/                      # ディレクトリ内の全Markdownファイルを処理
  md-cloudflare-images -i ./docs/ -r                   # ディレクトリを再帰的に処理
  md-cloudflare-images -i ./docs/ -o ./processed/      # 処理結果を別のディレクトリに保存
  md-cloudflare-images -i ./docs/ -p "**/*.markdown"   # 特定の拡張子のファイルのみ処理
  `);
  process.exit(args.includes('-h') || args.includes('--help') ? 0 : 1);
}

// 引数の解析
for (let i = 0; i < args.length; i++) {
  if (args[i] === '-i' || args[i] === '--input') {
    inputPath = args[i + 1];
    i++;
  } else if (args[i] === '-o' || args[i] === '--output') {
    outputDir = args[i + 1];
    overwriteInput = false; // 出力ディレクトリが指定された場合は上書きしない
    i++;
  } else if (args[i] === '-n' || args[i] === '--no-overwrite') {
    overwriteInput = false; // 上書きしないオプション
  } else if (args[i] === '-r' || args[i] === '--recursive') {
    recursive = true; // 再帰的に処理
  } else if (args[i] === '-p' || args[i] === '--pattern') {
    filePattern = args[i + 1];
    i++;
  }
}

// 入力パスが指定されていることを確認
if (!inputPath) {
  console.error('エラー: 入力パスが指定されていません。-i または --input オプションを使用してください。');
  process.exit(1);
}

// 入力パスが存在することを確認
if (!fs.existsSync(inputPath)) {
  console.error(`エラー: 入力パス "${inputPath}" が見つかりません。`);
  process.exit(1);
}

// Cloudflare Images API設定 - 修正版
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

// デバッグログを追加
console.log('🔍 環境変数チェック');
console.log(`CLOUDFLARE_ACCOUNT_ID: ${CLOUDFLARE_ACCOUNT_ID ? 'OK' : 'NG'}`);
console.log(`CLOUDFLARE_API_TOKEN: ${CLOUDFLARE_API_TOKEN ? 'OK' : 'NG'}`);

if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
  console.error('エラー: CloudflareのアカウントIDとAPIトークンが必要です。環境変数を設定してください：');
  console.error('  $env:CLOUDFLARE_ACCOUNT_ID="あなたのアカウントID"');
  console.error('  $env:CLOUDFLARE_API_TOKEN="あなたのAPIトークン"');
  process.exit(1);
}

const CLOUDFLARE_IMAGES_API = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/images/v1`;

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

// ファイルを再帰的に検索する関数
function findFiles(dir, pattern, recursive) {
  let results = [];
  const files = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    
    if (file.isDirectory()) {
      if (recursive) {
        // 再帰的にディレクトリを処理
        results = results.concat(findFiles(fullPath, pattern, recursive));
      }
    } else {
      // ファイルパターンに一致するか確認
      // 簡易的なglobパターンマッチング
      const matches = (pattern) => {
        if (pattern === '*') return true;
        if (pattern.startsWith('*.')) {
          const ext = pattern.slice(1); // "*.md" -> ".md"
          return file.name.endsWith(ext);
        }
        if (pattern === '**/*.md' || pattern === '**/*.markdown') {
          return file.name.endsWith('.md') || file.name.endsWith('.markdown');
        }
        // 完全一致
        return file.name === pattern;
      };
      
      if (matches(pattern)) {
        results.push(fullPath);
      }
    }
  }
  
  return results;
}

// 入力パスから処理対象ファイルのリストを取得
function getFilesToProcess(inputPath, pattern, recursive) {
  const stats = fs.statSync(inputPath);
  
  if (stats.isFile()) {
    // 単一ファイルの場合
    return [inputPath];
  } else if (stats.isDirectory()) {
    // ディレクトリの場合、パターンに一致するファイルを検索
    return findFiles(inputPath, pattern, recursive);
  }
  
  return [];
}

// Markdownファイルを処理する関数（フロントマター対応版）
async function processMarkdownFile(inputFilePath, outputFilePath) {
  console.log(`🔍 処理を開始: ${inputFilePath}`);
  
  // Markdownファイルを読み込む
  const markdownContent = fs.readFileSync(inputFilePath, 'utf8');
  const markdownDir = path.dirname(inputFilePath);
  
  // 置換処理のためにPromiseを保持する配列
  const replacementPromises = [];
  const replacements = [];
  
  // 1. フロントマター内の画像フィールドを処理
  console.log(`🔍 フロントマター内の画像を検索中...`);
  
  // フロントマター内の画像フィールドを検出する正規表現
  const frontMatterImageRegex = /(coverImage|image|thumbnail|hero|banner|featuredImage):\s*["']([^"']+)["']/gi;
  
  let frontMatterMatch;
  while ((frontMatterMatch = frontMatterImageRegex.exec(markdownContent)) !== null) {
    const [fullMatch, fieldName, imagePath] = frontMatterMatch;
    
    console.log(`🎯 フロントマター画像を発見: ${fieldName}: ${imagePath}`);
    
    // 外部URLの場合はスキップ
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      console.log(`⏭️  既にURLのため処理をスキップ: ${imagePath}`);
      continue;
    }
    
    // 相対パスを絶対パスに変換
    const absoluteImagePath = path.isAbsolute(imagePath) 
      ? imagePath 
      : path.resolve(markdownDir, imagePath);
    
    // ファイルが存在するか確認
    if (!fs.existsSync(absoluteImagePath)) {
      console.warn(`⚠️  警告: 画像ファイルが見つかりません: ${absoluteImagePath}`);
      continue;
    }
    
    console.log(`📸 フロントマター画像を処理中: ${absoluteImagePath}`);
    
    // アップロード処理のPromiseを作成
    const uploadPromise = uploadImageToCloudflare(absoluteImagePath)
      .then(cloudflareUrl => {
        console.log(`🎉 フロントマターアップロード成功: ${absoluteImagePath} → ${cloudflareUrl}`);
        replacements.push({
          original: fullMatch,
          replacement: `${fieldName}: "${cloudflareUrl}"`
        });
      })
      .catch(error => {
        console.error(`💥 フロントマター画像 ${absoluteImagePath} の処理に失敗:`, error);
      });
    
    replacementPromises.push(uploadPromise);
  }
  
  // 2. Markdown記法の画像を処理（元の処理）  
  console.log(`🔍 Markdown記法の画像を検索中...`);
  
  // 画像パターンを検出するための正規表現
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  
  // すべての画像パターンを見つける
  let match;
  while ((match = imageRegex.exec(markdownContent)) !== null) {
    const [fullMatch, altText, imagePath] = match;
    
    console.log(`🎯 Markdown画像を発見: ![${altText}](${imagePath})`);
    
    // 外部URLの場合はスキップ
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      console.log(`⏭️  既にURLのため処理をスキップ: ${imagePath}`);
      continue;
    }
    
    // 相対パスを絶対パスに変換
    const absoluteImagePath = path.isAbsolute(imagePath) 
      ? imagePath 
      : path.resolve(markdownDir, imagePath);
    
    // ファイルが存在するか確認
    if (!fs.existsSync(absoluteImagePath)) {
      console.warn(`⚠️  警告: 画像ファイルが見つかりません: ${absoluteImagePath}`);
      continue;
    }
    
    console.log(`📸 Markdown画像を処理中: ${absoluteImagePath}`);
    
    // アップロード処理のPromiseを作成
    const uploadPromise = uploadImageToCloudflare(absoluteImagePath)
      .then(cloudflareUrl => {
        console.log(`🎉 Markdownアップロード成功: ${absoluteImagePath} → ${cloudflareUrl}`);
        replacements.push({
          original: fullMatch,
          replacement: `![${altText}](${cloudflareUrl})`
        });
      })
      .catch(error => {
        console.error(`💥 Markdown画像 ${absoluteImagePath} の処理に失敗:`, error);
      });
    
    replacementPromises.push(uploadPromise);
  }
  
  console.log(`📊 処理対象となる画像の総数: ${replacementPromises.length}`);
  
  if (replacementPromises.length === 0) {
    console.log(`ℹ️  処理対象の画像がありませんでした`);
    return 0;
  }
  
  // すべてのアップロードが完了するのを待つ
  console.log(`⏳ 画像アップロード処理を実行中...`);
  await Promise.all(replacementPromises);
  
  console.log(`📊 実際に置換される項目数: ${replacements.length}`);
  
  // 置換を実行
  let updatedContent = markdownContent;
  replacements.forEach(({ original, replacement }, index) => {
    console.log(`🔄 置換 ${index + 1}: 
  元: ${original}
  新: ${replacement}`);
    updatedContent = updatedContent.replace(original, replacement);
  });
  
  // 変更があったかチェック
  if (updatedContent === markdownContent) {
    console.log(`ℹ️  ファイル内容に変更はありませんでした`);
  } else {
    console.log(`✅ ファイル内容が更新されました`);
  }
  
  // 出力ディレクトリが存在しない場合は作成
  const outputDir = path.dirname(outputFilePath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // 更新されたMarkdownを保存
  fs.writeFileSync(outputFilePath, updatedContent, 'utf8');
  
  if (inputFilePath === outputFilePath) {
    console.log(`💾 処理完了. 入力ファイルを上書き: ${outputFilePath}`);
  } else {
    console.log(`💾 処理完了. 更新されたMarkdownを保存: ${outputFilePath}`);
  }
  
  return replacements.length;
}

// メイン処理の実行
async function main() {
  try {
    // 処理対象ファイルのリストを取得
    const filesToProcess = getFilesToProcess(inputPath, filePattern, recursive);
    
    if (filesToProcess.length === 0) {
      console.log(`処理対象のファイルが見つかりませんでした。`);
      return;
    }
    
    console.log(`📋 処理対象ファイル数: ${filesToProcess.length}`);
    
    let totalImagesReplaced = 0;
    
    // 各ファイルを順番に処理
    for (const filePath of filesToProcess) {
      let outputFilePath;
      
      if (outputDir) {
        // 出力ディレクトリが指定されている場合
        const relativePath = path.relative(inputPath, filePath);
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
    
    console.log(`🎊 処理が完了しました。置換した画像の総数: ${totalImagesReplaced}`);
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  }
}

// スクリプトを実行
main();