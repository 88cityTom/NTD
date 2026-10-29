/* =========================================================
   登場人物の定義（コミュの名札・立ち絵）
   - 立ち絵は assets/chara/<id>_<表情>.webp を読み込む
     例：id 'a' の smile → assets/chara/a_smile.webp
   - その表情の画像がなければ <id>_normal.webp、それもなければ仮の影を出す
   - 名前・色・時間観の札（tag）はすべて仮。決まりしだい書き換える
   ========================================================= */

const CHARACTERS = {
  // 主人公（立ち絵は出さない想定。名札の色だけ）
  player: {
    name: '主人公',
    tag: '',
    color: '#aeb9ff'
  },

  // 他者A（仮）：発表原稿の「ブロック内の座標を指定して時間を移動する」
  a: {
    name: '他者A',
    tag: '座標の時間',
    color: '#8fd6c9'
  },

  // 他者B（仮）：発表原稿の「体感時間を伸ばしたり縮めたりする」
  b: {
    name: '他者B',
    tag: '伸縮する時間',
    color: '#e6ac6e'
  }
};

/* 立ち絵のファイル名（表情ごとに個別のファイルを使いたいときは expressions で上書きできる）
   例：a: { ..., expressions: { smile: 'assets/chara/a_laugh.webp' } } */
function getCharacterImage(id, expr) {
  const c = CHARACTERS[id];
  if (c && c.expressions && c.expressions[expr]) return c.expressions[expr];
  return `assets/chara/${id}_${expr || 'normal'}.webp`;
}
