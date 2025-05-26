#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const FormData = require('form-data');
require('dotenv').config();

// コマンドライン引数の処理
const args = process.argv.slice(2);
let inputPath = '';
let recursive = false;

// ヘルプメッセージの表示
if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
  console.log(`
統合Markdown処理ツール - 画像アップロードとJSON生成を統合実行

使用方法: node integrated-processor.js [オプション]

オプション:
  -i, --input <path>     処理するディレクトリのパス (必須)
  -r, --recursive        ディレクトリを再帰的に処理
  -h, --help             このヘルプメッセージを表示

環境変数:
  CLOUDFLARE_ACCOUNT_ID   Cloudflareアカウント識別子 (必須)
  CLOUDFLARE_API_TOKEN    CloudflareのAPIトークン (必須)
  `);
  process.exit(0);
}

// 引数の解析
for (let i = 0; i < args.length; i++) {
  if (args[i] === '-i' || args[i] === '--input') {
    inputPath = args[i + 1];
    i++;
  } else if (args[i] === '-r' || args[i] === '--recursive') {
    recursive = true;
  }
}

if (!inputPath) {
  console.error('エラー: 入力パスが指定されていません。-i または --input オプションを使用してください。');
  process.exit(1);
}

// Cloudflare Images API設定
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
  console.error('エラー: CloudflareのアカウントIDとAPIトークンが必要です。環境変数を設定してください。');
  process.exit(1);
}

const CLOUDFLARE_IMAGES_API = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/images/v1`;

// グローバルな画像URLマッピング（重複アップロード防止用）
const imageUrlMap = new Map();

// 画像をCloudflare Imagesにアップロードする関数（重複チェック付き）
async function uploadImageToCloudflare(imagePath) {
  // 既にアップロード済みかチェック
  const absolutePath = path.resolve(imagePath);
  if (imageUrlMap.has(absolutePath)) {
    console.log(`🔄 キャッシュから取得: ${imagePath} → ${imageUrlMap.get(absolutePath)}`);
    return imageUrlMap.get(absolutePath);
  }

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
    
    const cloudflareUrl = data.result.variants[0];
    // キャッシュに保存
    imageUrlMap.set(absolutePath, cloudflareUrl);
    
    console.log(`🎉 新規アップロード成功: ${imagePath} → ${cloudflareUrl}`);
    return cloudflareUrl;
  } catch (error) {
    console.error(`画像 ${imagePath} のアップロードエラー:`, error);
    throw error;
  }
}

// ファイルを再帰的に検索する関数
function findMarkdownFiles(dir, recursive) {
  let results = [];
  const files = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    
    if (file.isDirectory() && recursive) {
      results = results.concat(findMarkdownFiles(fullPath, recursive));
    } else if (file.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  
  return results;
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

// Markdownファイルを処理する関数（画像処理 + メタデータ抽出）
async function processMarkdownFile(filePath) {
  console.log(`🔍 処理を開始: ${filePath}`);
  
  const content = fs.readFileSync(filePath, 'utf8');
  const markdownDir = path.dirname(filePath);
  
  // 置換処理のためのPromiseを保持する配列
  const replacementPromises = [];
  const replacements = [];
  
  // 1. フロントマター内の画像フィールドを処理
  console.log(`🔍 フロントマター内の画像を検索中...`);
  
  const frontMatterImageRegex = /(coverImage|image|thumbnail|hero|banner|featuredImage):\s*["']?([^"'\n\r]+)["']?/gi;
  
  let frontMatterMatch;
  while ((frontMatterMatch = frontMatterImageRegex.exec(content)) !== null) {
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
    
    if (!fs.existsSync(absoluteImagePath)) {
      console.warn(`⚠️  警告: 画像ファイルが見つかりません: ${absoluteImagePath}`);
      continue;
    }
    
    console.log(`📸 フロントマター画像を処理中: ${absoluteImagePath}`);
    
    const uploadPromise = uploadImageToCloudflare(absoluteImagePath)
      .then(cloudflareUrl => {
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
  
  // 2. Markdown記法の画像を処理
  console.log(`🔍 Markdown記法の画像を検索中...`);
  
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  
  let match;
  while ((match = imageRegex.exec(content)) !== null) {
    const [fullMatch, altText, imagePath] = match;
    
    console.log(`🎯 Markdown画像を発見: ![${altText}](${imagePath})`);
    
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      console.log(`⏭️  既にURLのため処理をスキップ: ${imagePath}`);
      continue;
    }
    
    const absoluteImagePath = path.isAbsolute(imagePath) 
      ? imagePath 
      : path.resolve(markdownDir, imagePath);
    
    if (!fs.existsSync(absoluteImagePath)) {
      console.warn(`⚠️  警告: 画像ファイルが見つかりません: ${absoluteImagePath}`);
      continue;
    }
    
    console.log(`📸 Markdown画像を処理中: ${absoluteImagePath}`);
    
    const uploadPromise = uploadImageToCloudflare(absoluteImagePath)
      .then(cloudflareUrl => {
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
  
  // すべてのアップロードが完了するのを待つ
  if (replacementPromises.length > 0) {
    console.log(`⏳ 画像アップロード処理を実行中...`);
    await Promise.all(replacementPromises);
  }
  
  // 置換を実行
  let updatedContent = content;
  replacements.forEach(({ original, replacement }) => {
    updatedContent = updatedContent.replace(original, replacement);
  });
  
  // ファイルを更新（変更があった場合のみ）
  if (updatedContent !== content) {
    fs.writeFileSync(filePath, updatedContent, 'utf8');
    console.log(`💾 ファイルを更新: ${filePath}`);
  }
  
  // メタデータを抽出（更新後のコンテンツから）
  const metadata = parseFrontMatter(updatedContent);
  const fileName = path.basename(filePath, '.md');
  
  return {
    fileName,
    ...metadata,
    replacedImages: replacements.length
  };
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

// メイン処理
async function main() {
  try {
    console.log('🚀 統合処理を開始...');
    console.log(`📂 入力パス: ${inputPath}`);
    console.log(`🔄 再帰処理: ${recursive ? 'ON' : 'OFF'}`);
    console.log('');

    const absoluteInputPath = path.resolve(inputPath);
    
    if (!fs.existsSync(absoluteInputPath)) {
      console.error(`❌ エラー: パスが存在しません: ${absoluteInputPath}`);
      process.exit(1);
    }

    // 各フォルダを処理
    const folders = ['events', 'news', 'posts'];
    let totalImagesReplaced = 0;
    
    for (const folder of folders) {
      const folderPath = path.join(absoluteInputPath, folder);
      
      if (!fs.existsSync(folderPath)) {
        console.log(`📁 フォルダが存在しません: ${folder}`);
        continue;
      }

      console.log(`\n📁 ${folder} フォルダを処理中...`);
      
      const markdownFiles = findMarkdownFiles(folderPath, recursive);
      
      if (markdownFiles.length === 0) {
        console.log(`  📄 Markdownファイルが見つかりません`);
        // 空のJSONファイルを作成
        const outputPath = path.join(absoluteInputPath, `${folder}.json`);
        fs.writeFileSync(outputPath, JSON.stringify([], null, 2), 'utf8');
        console.log(`  📄 空のJSONファイルを作成: ${outputPath}`);
        continue;
      }

      console.log(`  📄 発見したMarkdownファイル数: ${markdownFiles.length}`);
      
      // 各ファイルを処理
      const markdownData = [];
      for (const filePath of markdownFiles) {
        try {
          const processedData = await processMarkdownFile(filePath);
          markdownData.push(processedData);
          totalImagesReplaced += processedData.replacedImages || 0;
        } catch (error) {
          console.error(`❌ ファイル処理エラー: ${filePath}`, error);
        }
      }

      // JSONファイルを生成
      const outputPath = path.join(absoluteInputPath, `${folder}.json`);
      fs.writeFileSync(outputPath, JSON.stringify(markdownData, null, 2), 'utf8');
      console.log(`  📄 JSONファイルを生成: ${outputPath} (${markdownData.length}エントリ)`);

      // postsフォルダの場合はカテゴリー統計も生成
      if (folder === 'posts') {
        const categoryStats = calculateCategoryStats(markdownData);
        const categoryOutputPath = path.join(absoluteInputPath, 'posts-categories.json');
        fs.writeFileSync(categoryOutputPath, JSON.stringify(categoryStats, null, 2), 'utf8');
        console.log(`  📊 カテゴリー統計を生成: ${categoryOutputPath} (${categoryStats.length}カテゴリ)`);
      }
    }

    console.log('\n🎊 統合処理が完了しました！');
    console.log(`📊 総置換画像数: ${totalImagesReplaced}`);
    console.log(`🗂️  重複防止により節約されたアップロード数: ${imageUrlMap.size - totalImagesReplaced}`);
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

// スクリプトを実行
main();