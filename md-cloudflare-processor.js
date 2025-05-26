#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
require('dotenv').config()
// 基本的な診断情報を出力
console.log('🔍 === 診断開始 ===');
console.log(`📍 現在のディレクトリ: ${process.cwd()}`);
console.log(`📍 Node.js バージョン: ${process.version}`);
console.log(`📍 実行時引数: ${JSON.stringify(process.argv)}`);

// 引数の解析（簡易版）
const args = process.argv.slice(2);
let inputDir = './';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '-i' || args[i] === '--input') {
    inputDir = args[i + 1];
    i++;
  }
}

console.log(`📂 入力ディレクトリ: ${inputDir}`);

// ディレクトリの存在確認
const absoluteInputDir = path.resolve(inputDir);
console.log(`📂 絶対パス: ${absoluteInputDir}`);

if (!fs.existsSync(absoluteInputDir)) {
  console.error(`❌ エラー: ディレクトリが存在しません: ${absoluteInputDir}`);
  process.exit(1);
}

console.log(`✅ ディレクトリ存在確認OK`);

// ディレクトリ内容の確認
try {
  console.log(`📋 ディレクトリ内容:`);
  const items = fs.readdirSync(absoluteInputDir, { withFileTypes: true });
  
  items.forEach(item => {
    const type = item.isDirectory() ? '📁' : '📄';
    console.log(`  ${type} ${item.name}`);
  });
  
  // Markdownファイルの検索
  function findMarkdownFiles(dir, level = 0) {
    let results = [];
    const indent = '  '.repeat(level);
    
    try {
      const files = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const file of files) {
        const fullPath = path.join(dir, file.name);
        
        if (file.isDirectory()) {
          console.log(`${indent}📁 ${file.name}/`);
          if (level < 3) { // 深すぎる階層は避ける
            results = results.concat(findMarkdownFiles(fullPath, level + 1));
          }
        } else if (file.name.endsWith('.md')) {
          console.log(`${indent}📄 ${file.name} ⭐ (Markdown)`);
          results.push(fullPath);
        } else {
          console.log(`${indent}📄 ${file.name}`);
        }
      }
    } catch (error) {
      console.error(`${indent}❌ ディレクトリ読み取りエラー: ${error.message}`);
    }
    
    return results;
  }
  
  console.log(`\n🔍 Markdownファイルの詳細検索:`);
  const markdownFiles = findMarkdownFiles(absoluteInputDir);
  
  console.log(`\n📊 結果:`);
  console.log(`  発見したMarkdownファイル数: ${markdownFiles.length}`);
  
  if (markdownFiles.length > 0) {
    console.log(`\n📋 発見したMarkdownファイル一覧:`);
    markdownFiles.forEach((file, index) => {
      console.log(`  ${index + 1}. ${file}`);
      
      // ファイルの内容をチェック
      try {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n');
        console.log(`     📊 行数: ${lines.length}`);
        console.log(`     📊 文字数: ${content.length}`);
        
        // フロントマターチェック
        if (content.startsWith('---')) {
          console.log(`     ✅ フロントマターあり`);
        } else {
          console.log(`     ❌ フロントマターなし`);
        }
        
        // 画像記法チェック
        const imageMatches = content.match(/!\[([^\]]*)\]\(([^)]+)\)/g);
        if (imageMatches) {
          console.log(`     🖼️  画像記法: ${imageMatches.length}個`);
          imageMatches.forEach(match => {
            console.log(`        - ${match}`);
          });
        } else {
          console.log(`     📷 画像記法: なし`);
        }
        
        // フロントマター内の画像フィールドチェック
        const frontMatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (frontMatterMatch) {
          const frontMatter = frontMatterMatch[1];
          const imageFieldMatches = frontMatter.match(/(coverImage|image|thumbnail|hero|banner):\s*["']?([^"'\n\r]+)["']?/gi);
          if (imageFieldMatches) {
            console.log(`     🎯 フロントマター画像フィールド: ${imageFieldMatches.length}個`);
            imageFieldMatches.forEach(match => {
              console.log(`        - ${match}`);
            });
          } else {
            console.log(`     🎯 フロントマター画像フィールド: なし`);
          }
        }
        
        console.log(`     📝 最初の100文字: "${content.substring(0, 100).replace(/\n/g, '\\n')}"`);
        
      } catch (error) {
        console.error(`     ❌ ファイル読み取りエラー: ${error.message}`);
      }
      
      console.log(''); // 空行
    });
  } else {
    console.log(`❌ Markdownファイルが見つかりませんでした`);
    console.log(`\n💡 考えられる原因:`);
    console.log(`  1. .mdファイルが存在しない`);
    console.log(`  2. サブディレクトリにのみ存在している`);
    console.log(`  3. ファイル拡張子が異なる（.markdown など）`);
  }
  
} catch (error) {
  console.error(`❌ ディレクトリスキャンエラー: ${error.message}`);
}

// 環境変数のチェック
console.log(`\n🔐 環境変数チェック:`);
const requiredEnvVars = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'];
requiredEnvVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    console.log(`  ✅ ${varName}: 設定済み (${value.substring(0, 8)}...)`);
  } else {
    console.log(`  ❌ ${varName}: 未設定`);
  }
});

console.log(`\n✅ === 診断完了 ===`);