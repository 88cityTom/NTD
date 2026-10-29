/* =========================================================
   コミュ台本（サンプル）
   UIの動作確認用。本文はすべて仮のダミーで、物語の内容ではない。

   一行（step）に書けること：
     speaker    : 'none'（地の文）／ 'player'（主人公）／ CHARACTERS のid
     name       : 名札の表示名を上書き（「？？？」など）
     expression : 話者の表情（立ち絵のファイル名に使う）
     text       : 本文
     enter      : 登場させる [{ id, pos: 'left'|'center'|'right', expression }]
     exit       : 退場させる ['a', ...]（'all' で全員）
     bg         : 背景を切り替える（assets/bg/<bg>.webp）
     time       : 右上の時刻表示を切り替える（ただの文字列）
     place      : 右上の場所表示を切り替える
     effect     : 'flash' | 'fade' | 'rewind'（巻き戻し）| 'freeze'（停止）| 'stretch'（伸縮）
     choices    : 選択肢 [{ text, response, responseSpeaker, responseExpression, next: [step...],
                            locked: true, lockLabel: '条件の説明' }]
   ========================================================= */

const SAMPLE_EPISODE = {
  id: 'ep_sample',
  kicker: 'EPISODE 00',
  title: 'コミュ表示のサンプル',
  time: 'T+00:00:00',
  place: '（場所未定）',
  bg: 'sample_01',
  script: [
    {
      speaker: 'none',
      text: '（地の文の表示例）\n話者のいない行は、名札を出さずに表示します。クリック・Enter・Space で次へ進みます。'
    },
    {
      speaker: 'a',
      enter: [{ id: 'a', pos: 'center', expression: 'normal' }],
      text: '「（他者Aの台詞の例）登場した人物は、立ち絵の位置に表示されます。画像がまだ無いあいだは、置くべきファイル名を表示します」'
    },
    {
      speaker: 'a',
      expression: 'smile',
      text: '「表情を変えると、立ち絵が assets/chara/a_smile.webp に切り替わります。無ければ a_normal.webp のままです」'
    },
    {
      speaker: 'b',
      name: '？？？',
      enter: [{ id: 'a', pos: 'left' }, { id: 'b', pos: 'right', expression: 'normal' }],
      text: '「（他者Bの台詞の例）名札の名前は、台本ごとに上書きできます。話している人以外は、少し暗く沈みます」'
    },
    {
      speaker: 'player',
      text: '「（主人公の台詞の例）主人公の名札は、色で区別します」'
    },
    {
      speaker: 'none',
      time: 'T+00:00:12',
      text: '（時刻表示の例）\n台本の time を変えると、右上の時刻が切り替わります。上の線は、このエピソード全体のうち、いまどこにいるかを示します。'
    },
    {
      speaker: 'a',
      effect: 'rewind',
      time: 'T−00:03:40',
      text: '「（演出の例：巻き戻し）画面が一瞬、逆向きに流れます」'
    },
    {
      speaker: 'a',
      effect: 'freeze',
      text: '「（演出の例：停止）この行のあいだ、画面の時間が止まったように見せます」'
    },
    {
      speaker: 'b',
      effect: 'stretch',
      text: '「（演出の例：伸縮）この行は、文字がゆっくり流れます」'
    },
    {
      speaker: 'b',
      text: '「（選択肢の例）返事を選んでください」',
      choices: [
        {
          text: '（選択肢1）',
          response: '「（選択肢1を選んだときの返答）」'
        },
        {
          text: '（選択肢2）',
          response: '「（選択肢2を選んだときの返答）」',
          responseExpression: 'smile',
          next: [
            { speaker: 'a', text: '「（選択肢2のあとだけに差し込まれる行）選んだ時間線によって、ここに入る行が変わります」' }
          ]
        },
        {
          text: '（選択肢3）',
          locked: true,
          lockLabel: '（条件の説明。例：〇〇を知っている）'
        }
      ]
    },
    {
      speaker: 'none',
      exit: ['b'],
      bg: 'sample_02',
      place: '（別の場所）',
      time: '----:--:--',
      text: '（背景の切り替え例）\nbg を指定すると、背景がゆっくり切り替わります。exit で人物を退場させます。'
    },
    {
      speaker: 'a',
      enter: [{ id: 'a', pos: 'center' }],
      effect: 'flash',
      text: '「ここでサンプルは終わりです。L で会話の記録、H でウィンドウを隠せます」'
    }
  ]
};
