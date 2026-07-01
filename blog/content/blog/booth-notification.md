---
title: Booth の新着商品を Discord に通知する
description: Booth の新着商品を Discord に垂れ流してくれるアプリを作ったので簡単に紹介します。
date: 2026-07-02
tags:
  - VRChat
  - Booth
  - Github Actions
image:
  src: thumbnails/booth-notification.png
  alt: Chocolat_B1GleipnirSwimwear
---

Booth の VRChat 対応の新着商品を垂れ流してくれる Twitter[^1] アカウントが前ありましたよね。  
それを Discord でやってくれるアプリを作ったよーの回です。  

バイブコーディングでさくっと作ったのと特に難しいことはしてないので内容薄め。

リポジトリは[こちら](https://github.com/ekureaa/booth-notification)。

Booth の検索結果画面をスクレイピングして新しい商品があったら Discord の Webhook に投げるだけのアプリです。

![各種情報がいい感じに表示される](content/booth-notification-1.png)

Discord の webhook とスクレイピングの URL を一対一で対応させてるので、自分の使用アバターに分けたり、髪型と衣装で分けたりなど色々好きなようにできます。

あと、Booth は商品に無料版と有料版があったときに、検索結果一覧では有料版の値段が表示されてしまうので探しにくいです。  
無料の商品をこぼしなく確認したいなーとも思っていたので、このアプリでは `free_only` のフラグを建てておくと、詳細ページまで確認して無料かどうか見てくれるようにしました。  

毎時 Cloudflare Workers から Github Actions を発火させて、その中でスクレイピング～Discord への通知を行ってくれるようになってます。  
Github Actions 側で cron 機能もあるのですが、試したところ実行してくれる確率が低すぎるので[^2]、外部から叩くようにしました。

今回はそんなところです。  
最近は codex くんが全部頑張ってくれるので、自分のための趣味開発という面ではとてもやりやすいですね。  
ただ、何もしていなさ過ぎて中身のロジックまでちゃんと確認してないので、そのままフォークして使う場合は注意です。

[^1]: X ともいう。
[^2]: 自分がやったときは実行率30%くらい…。
