# 公開URLから個人名を外すとき

GitHub Pagesの標準URLは `https://所有者名.github.io/リポジトリ名/` です。リポジトリ名だけを変えても、所有者名の部分は残ります。

選べる方法は、アプリ用のGitHub Organizationへリポジトリを移す、GitHubアカウントのユーザー名を変更する、所有する独自ドメインを設定する、の3つです。公開リポジトリなら無料のOrganizationでPagesを利用できます。アプリだけのURLを変える場合は、アプリ用Organizationで管理する方法が使えます。

URLから個人名を外すことと、公開情報から個人との関連を完全に消すことは異なります。リポジトリの移管ではコミット履歴と投稿者情報が保持されます。公開プロフィール、過去の履歴、共有済みのリンク等に残る名前は、別途確認が必要です。この資料は匿名性を保証するものではありません。

## 変更前に行うこと

1. **いつも記録している端末のPaceを、いつものアイコンから開きます。** 別の端末やブラウザの空のPaceではなく、実際の記録が入っているアプリを使います。
2. 入力途中の支出がある場合は、先に保存します。バックアップには下書きは含まれません。
3. 設定 → バックアップと書き出しから、JSONまたは暗号化バックアップを作成します。
4. 「ファイルを保存」を押し、端末のファイル一覧に保存できたことを確認します。暗号化した場合はパスワードも自分で保管します。
5. すでに他の人も使用している場合は、その人も自分の端末でバックアップします。家計情報はユーザーごとに端末内にあるため、開発者が一括移行することはできません。

**バックアップはGitHubにアップロードしません。** コード公開用のフォルダーにも入れないでください。

## GitHubのユーザー名と表示名を変更する場合

バックアップを端末に保存してから進めます。ユーザー名の変更はPaceだけでなく、同じGitHubアカウントの他のリポジトリにも影響します。

1. 個人名を含まない新しいユーザー名を決めます。空き状況はGitHubの変更画面で確認します。
2. GitHubの右上のプロフィール画像 → Settings → Account → Change usernameから変更します。画面に表示される影響を確認してから確定します。
3. Settings → Public profileのNameも個人名を含まない表示名に変更し、Update profileを押します。Bio、公開メール、所在地、個人サイトやSNSへのリンクも確認します。
4. 公開ファイルの本文やリンクに残っている個人名を修正します。ローカルの修正は、GitHubへ反映するまで公開中のファイルには反映されません。
5. 過去のコミット作者名・メールは、ユーザー名や表示名の変更だけでは消えません。必要な履歴対応は現物を確認して決めます。検索エンジンのキャッシュや他の人が保存したコピーまで削除できることは保証できません。
6. 新しい所有者名でPagesを再公開し、実際のURLと起動を確認します。旧URLの転送を前提にせず、共有リンクを更新します。

## URL変更後に行うこと

1. 新しい公開先でGitHub Actionsを実行し、Pagesの公開URLを確認します。
2. 同じスマートフォンの普段使うブラウザで、新しいHTTPS URLを開きます。
3. **新しいURLのPaceをホーム画面へ追加し、新しいアイコンから起動します。** iPhoneではSafariとホーム画面アプリの保存領域が分かれるため、実際に使う新しいアプリ内で復元します。
4. 初回画面では「設定をあとで行う」から設定へ進めます。設定 → バックアップを復元から、保存しておいたバックアップを読み込みます。復元は新しいURL側の家計データ全体を置き換えます。追記や統合ではありません。
5. 残高、支出件数、カード、借入、貯金等が引き継がれていることを確認します。
6. 新しいPaceで指紋等のデバイス認証、または6桁PINを設定し直します。バックアップではロック設定が移らないため、復元しただけではロックは設定されません。
7. 新しいアイコンから再起動し、履歴・残高・ロックを確認します。確認後に古いアイコンを整理し、以後は新しいPaceへ記録します。

公開先のホスト名が変わると、IndexedDBやロック設定は別の保存領域になります。元の端末内記録が新しいURLへ自動で移ることはありません。新しいURLで空に見えても、それだけで古い記録が削除されたことを意味しません。

登録した認証情報はバックアップに含まれません。指紋の生体情報そのものをPaceが移行・保存することはなく、新しい公開先で認証鍵を登録します。PINも新しい公開先で設定し直します。

移行確認前に旧Paceをアンインストールしたり、ブラウザの保存データを消したりしないでください。古いURLのPWAはキャッシュがある場合に起動できても、移管後の配信や将来の起動を保証できません。変更前にバックアップを完成させてください。

## 通常の更新との違い

同じ公開URLに新機能を配信する通常の更新は、端末内データを維持する設計です。今回は公開先のホスト名を変えるため、一度だけバックアップ・復元・認証の再設定が必要です。URLが変わった後は、新しい同じURLに更新を配信していきます。

## GitHub公式資料

- [GitHub PagesのURL形式とプラン](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [Organizationの作成](https://docs.github.com/en/organizations/collaborating-with-groups-in-organizations/creating-a-new-organization-from-scratch)
- [リポジトリの移管と履歴の引き継ぎ](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository)
- [GitHubユーザー名の変更による影響](https://docs.github.com/en/account-and-profile/concepts/username-changes)
- [GitHubユーザー名を変更する手順](https://docs.github.com/en/account-and-profile/how-tos/account-management/changing-your-username)
- [プロフィール表示名の変更](https://docs.github.com/en/account-and-profile/tutorials/personalize-your-profile)
- [コミット作者名の変更と過去の履歴](https://docs.github.com/en/get-started/git-basics/setting-your-username-in-git)
- [独自ドメイン](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages)
- [Safariとホーム画面Webアプリのデータの分離（WebKit）](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/)
