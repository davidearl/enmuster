# enmuster
A cross-platform tool for deploying websites and web apps (or any other mirrored files)

It's a bit like servicing a code repository :-). But intended for
(multiple copies of) live web sites.

Website for end-user packages including Windows Installer and the help
file also included in the app, at [enmuster.net](http://enmuster.net).

This project is built using [nw.js](http://nwjs.io/), which provides a
desktop environment for node.js combined with the Chromium
browser. The source code here is tested against version 0.12.0 on
Windows 7 and 0.12.1 on Ubuntu. To use this repository you'll need to
download nw.js separately. The node.js packages, plus jQuery and
jQueryUI are included here.

Once you've got nw.js, run enmuster by executing the nw program in
nw.js with the enmuster directory as command line parameter. The
easiest way to do this in Windows is to create a shortcut (you can add
the right icon too: enmuster.ico in the enmuster folder). On Ubuntu
create an enmuster.desktop file which is a similar idea but different
format. Example at the top level here, just change the absolute
paths. In both cases, it's the directory containing package.json you
need to quote to nw.

There are two components, desktop and server. Get the server side by
clicking the button in the settings page once the desktop is up and
running. Instructions are in the file and background information in
the help.
