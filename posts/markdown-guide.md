---
title: "拡張Markdown記法の総合ガイド"
category: ["マークダウン", "チュートリアル", "技術"]
release: "2025-05-21T15:00:00.000Z"
excerpt: "このブログで使用できるすべての拡張Markdown記法の使い方を解説します"
coverImage: "/images/markdown-complete-guide.jpg"
---

# 拡張Markdown記法の総合ガイド

このブログでは、標準的なMarkdown記法に加えて、さまざまな拡張記法を使用できます。この記事では、すべての拡張機能の使い方を詳しく解説します。

## 1. カスタムブロック

特別な情報を強調するためのブロックです。

### 情報ブロック

:::info
これは情報ブロックです。重要な情報や補足説明を記述できます。
複数行にわたる内容も表示できます。
:::

### 警告ブロック

:::warning
これは警告ブロックです。注意が必要な情報や潜在的な問題を伝えるときに使用します。
:::

### エラーブロック

:::error
これはエラーブロックです。重大な問題や避けるべき状況を示すときに使用します。
:::

### 成功ブロック

:::success
これは成功ブロックです。正常に完了した手順やベストプラクティスを示すときに使用します。
:::

### メモブロック

:::note
これはメモブロックです。補足情報やヒント、覚書などを記述するときに使用します。
:::

## 2. ハイライト

テキスト内の特定の部分を==このようにハイライト==することができます。重要なポイントや==キーワード==を強調したいときに便利です。

## 3. 数式の記法

インラインの数式は $E = mc^2$ のように表示できます。

ブロック数式は以下のように表示できます：

$$
\frac{d}{dx}\left( \int_{a}^{x} f(t) \, dt \right) = f(x)
$$

複雑な数式も美しく表示できます：

$$
\begin{pmatrix}
a & b \\
c & d
\end{pmatrix}
\begin{pmatrix}
x \\
y
\end{pmatrix}
=
\begin{pmatrix}
ax + by \\
cx + dy
\end{pmatrix}
$$

## 4. 図表キャプション

画像にキャプションを付けることができます。

![美しい山の風景](https://imagedelivery.net/3-0TnxhaMhG-JZpRRgtqfg/2778025a-f155-4056-c8da-09c5abf24400/public) {caption=富士山の美しい風景。2025年春に撮影。}

表にもキャプションを付けられます：

| 名前 | 説明 | 使用例 |
|------|------|--------|
| 情報ブロック | 重要な情報を提供 | 補足説明、参考情報 |
| 警告ブロック | 注意喚起 | 潜在的な問題の警告 |
| エラーブロック | 問題報告 | 避けるべき状況の提示 |

{table-caption=表1: カスタムブロックの種類と用途}

## 5. 画像スライダー

複数の画像をスライダーとして表示できます。

:::slider
![春の風景](https://imagedelivery.net/3-0TnxhaMhG-JZpRRgtqfg/805a81d8-67ad-4542-dc3e-d06cf683cf00/large)
![夏の風景](https://imagedelivery.net/3-0TnxhaMhG-JZpRRgtqfg/b3e1a157-7aef-4ef1-d323-72928c5aa300/medium)
![秋の風景](https://imagedelivery.net/3-0TnxhaMhG-JZpRRgtqfg/9087e14a-f525-4a70-fa00-f3d02816ed00/thumbnail)
![冬の風景](https://imagedelivery.net/3-0TnxhaMhG-JZpRRgtqfg/b5cfedba-6160-4f60-218f-10a2d6722800/large)
:::

## 6. コードブロックとシンタックスハイライト

さまざまな言語のコードブロックはシンタックスハイライトに対応しています。

```javascript
// JavaScriptのコード例
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(10)); // 55
```

```css
/* CSSのコード例 */
.custom-block {
  margin: 1.5rem 0;
  padding: 1rem;
  border-radius: 0.5rem;
  border-left: 4px solid #3b82f6;
}

.custom-block-info {
  background-color: rgba(59, 130, 246, 0.1);
  border-left-color: #3b82f6;
}
```

```python
# Pythonのコード例
def quicksort(arr):
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quicksort(left) + middle + quicksort(right)

print(quicksort([3, 6, 8, 10, 1, 2, 1]))  # [1, 1, 2, 3, 6, 8, 10]
```

## 7. 標準的なMarkdown記法

もちろん、標準的なMarkdown記法も使用できます。

### 見出し

見出しは `#` から `######` までの6段階あります。

### リスト

- 箇条書きリスト
- 複数行にわたって
- 項目を書くことができます

1. 番号付きリスト
2. こちらも複数行で
3. 記述可能です

### 引用

> これは引用です。
> 複数行にわたって引用することもできます。
> 
> 引用内に空行を入れることも可能です。

### リンク

[Anthropicのウェブサイト](https://www.anthropic.com)

### 強調

*イタリック体* と **太字** を使用できます。

## 応用例 - すべての機能を組み合わせる

各機能を組み合わせることで、より魅力的でわかりやすい記事を作成できます。

:::info
重要な数式: $E = mc^2$

これはアインシュタインの**特殊相対性理論**から導かれる質量とエネルギーの等価性を表す方程式です。
詳細な解説は[こちらのリンク](https://en.wikipedia.org/wiki/Mass%E2%80%93energy_equivalence)を参照してください。
:::

### アルゴリズムの時間計算量の比較

| アルゴリズム | 最良時間計算量 | 平均時間計算量 | 最悪時間計算量 |
|------------|----------------|---------------|---------------|
| クイックソート | $O(n \log n)$ | $O(n \log n)$ | $O(n^2)$ |
| マージソート | $O(n \log n)$ | $O(n \log n)$ | $O(n \log n)$ |
| バブルソート | $O(n)$ | $O(n^2)$ | $O(n^2)$ |

{table-caption=表2: 代表的なソートアルゴリズムの時間計算量}

## まとめ

この記事で紹介した拡張Markdown記法を活用して、より読みやすく魅力的な記事を作成してください！特に複雑な技術的内容を説明する際には、==数式==、`コードブロック`、そして情報・警告ブロックを効果的に使うことで、読者の理解を助けることができます。

:::success
記事を書く際のポイント：

1. 適切な見出しで構造化する
2. 重要なポイントは適切にハイライトする
3. 複雑な概念は図表や数式を使って説明する
4. コードは適切にシンタックスハイライトを使用する
5. 特に重要な注意点は警告・情報ブロックで強調する
:::