#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// フロントマターを解析する関数
function parseFrontMatter(content) {
  // フロントマターの境界を検出
  const frontMatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontMatterMatch) {
    return {};
  }

  const frontMatterContent = frontMatterMatch[1];
  const metadata = {};
  
  // 行に分割
  const lines = frontMatterContent.split(/\r?\n/);
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i].trim();
    
    // 空行をスキップ
    if (!line) {
      i++;
      continue;
    }
    
    // コロンを含む行を探す
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      i++;
      continue;
    }
    
    const key = line.substring(0, colonIndex).trim();
    let value = line.substring(colonIndex + 1).trim();
    
    // 配列の処理
    if (value === '[') {
      // 複数行の配列
      const arrayItems = [];
      i++;
      
      while (i < lines.length) {
        const arrayLine = lines[i].trim();
        if (arrayLine === ']') {
          i++;
          break;
        }
        if (arrayLine && arrayLine !== ',') {
          // クォートを除去し、カンマを除去
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
      // 単一行の配列
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
      // 通常の値
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

// Markdownファイルを処理する関数
function processMarkdownFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    console.log(`Processing: ${filePath}`);
    
    // フロントマターの境界をチェック
    const frontMatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontMatterMatch) {
      console.log(`  No front matter found in ${filePath}`);
      return {
        fileName: path.basename(filePath, '.md')
      };
    }
    
    console.log(`  Front matter found, parsing...`);
    const metadata = parseFrontMatter(content);
    console.log(`  Parsed metadata:`, metadata);
    
    const fileName = path.basename(filePath, '.md');
    
    return {
      fileName,
      ...metadata
    };
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error);
    return null;
  }
}

// ディレクトリ内のMarkdownファイルを取得する関数
function getMarkdownFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    console.log(`Directory ${dirPath} does not exist`);
    return [];
  }

  const files = fs.readdirSync(dirPath);
  return files
    .filter(file => file.endsWith('.md'))
    .map(file => path.join(dirPath, file));
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
function main() {
  const folders = ['events', 'news', 'posts'];
  
  folders.forEach(folder => {
    const folderPath = path.join(process.cwd(), folder);
    const markdownFiles = getMarkdownFiles(folderPath);
    
    if (markdownFiles.length === 0) {
      console.log(`No markdown files found in ${folder} folder`);
      return;
    }

    const markdownData = markdownFiles
      .map(processMarkdownFile)
      .filter(data => data !== null);

    // 各フォルダのJSONファイルを生成
    const outputPath = path.join(process.cwd(), `${folder}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(markdownData, null, 2), 'utf8');
    console.log(`Generated ${outputPath} with ${markdownData.length} entries`);

    // postsフォルダの場合はカテゴリー統計も生成
    if (folder === 'posts') {
      const categoryStats = calculateCategoryStats(markdownData);
      const categoryOutputPath = path.join(process.cwd(), 'posts-categories.json');
      fs.writeFileSync(categoryOutputPath, JSON.stringify(categoryStats, null, 2), 'utf8');
      console.log(`Generated ${categoryOutputPath} with ${categoryStats.length} categories`);
    }
  });

  console.log('JSON generation completed!');
}

// スクリプトを実行
main();