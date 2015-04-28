<?php

define("ENMUSTER_DATA_DIRECTORY", "CHANGE-ME");

/*

This is the server side for Enmuster, a web site deployment tool -
just the one file.

This comprises an "Enmuster Server". It is intended to deploy changes
- that is, update - a "Target Site" from a local copy of the files on
your own computer.


INSTALLATION
------------

Ideally, the Enmuster Server should run as its own web site, i.e. with
its own URL; however, it can be in subfolder of the Target Site
if you must, and this is undoubtedly simpler.

Ideally, the Enmuster Server should be an encrypted web site, that is
HTTPS; however, it can be HTML if you must, and the data transferred
will be independently encrypted.

Ideally, you would put the Enmuster Server on its own port (a good
idea anyway as it should be private). This will avoid problems where
SSL (HTTPS) connections cannot share virtual servers on the same
port. However, the client is up-to-date so Server Name Indentity (SNI)
will also work. Of course, you cannot do this if is run as part of the
Target Site.

If you don't have HTTPS, you could also consider using a SSH tunnel to
the Enmuster Server and only allowing HTTP access from the server
machine itself.


SECURITY

This script enables arbitrary files to be uploaded to your server, and
some of them to be executed as scripts! But only by you, of course.
In theory.

These are the same operations you would do manually if updating your
web site, but you need to know what is happening to ensure that there
is no malicious access to your server.

It is not possible to use this script unless each user has installed a
public key on the server. While public keys can be safely - erm -
public, it is best not to advertise these and make sure they are not
accessible to a browser.

More importantly, don't ever put (allow to be uploaded) scripts which
are designed to be run as part of an update in location where any
browser can get at them, that is not part of the Target Site's public
HTML.


REQUIREMENTS

* a Linux server (it uses the Linux shell)
* ... with openssl installed (this secures the Enmuster Server)
* ... running Apache or just possibly some other web server
* ... with PHP version 5 or later.


SETTING UP

1. Create an Apache Virtual Host

... for the site if you can, with HTTPS if you can. This needs to run
under the same user account as the Apache which serves the site it
will update.

2. Put this file into the public html directory for the Enmuster
Server, or a subfolder within the Target Site if need be.

3. Make sure the web server can write to the files which are to be
updated in the Target Site.

...You might reasonably consider that bad practice, in which case
consider using the maintenance mode facility to enable access just
during the update, for example by setting file permissions.

4. Create a directory of your choice outside any public html

...(so that browsers cannot access it). This is the "Enmuster Data
Directory". Make sure the web server can write to this directory. This
is where your public key(s) go and also temporary files during
deployments.

5. Edit the ENMUSTER_DATA_DIRECTORY line at the top of this file

... to refer to that directory.

6. Create a link in the Enmuster Data Directory

...which refers to the root of the directory hierarchy which will be
updated during deployment. The name of this link is the same as the
name of the project. If you can't create a link, it can be a text file
containing just the path of the directory instead.

6a. If you are planning to use the same Enmuster Server to update more
than one instance of the Target Website...

... instead make a directory named according to the project and put
links (or files each containing a path) referencing each instance in
it. In this case, the names of these links/files go into the fragment
(has) part of the URL you quote to the client.

7. In the client...

... make a new project with the name you chose for the links in step 6
... drag the folder containing your local copy to the Enmuster window
... enter the Enmuster Server URLs 
... take particular care to identify exceptions: for example, if you
have a data directory where end users can upload files to, and this is
not made an exception, Enmuster will DELETE THEM if their directory is
ot marked as an exception, becvause they don't exist in your local
copy. (Actually it will back them up in the Enmuster Data Directory,
so it's not irrevocable, but they still vanish from the Target Site)


WHY IS THIS A PHP FILE?
-----------------------

The server side of Enmuster is fairly simple, and it could be provided
for a variety of platforms. However, PHP is one of the most widely
available, especially for off the shelf shared systems. Node.js is
another good candidate, especially as the client is based on Node.js,
and there are SSL solutions available which don't have installation
dependencies, but it doesn't sit well with Apache. Ruby is relatively
unusual. PHP is also potentially good for Microsoft Servers, though at
the moment Openssl is the killer.


*/

if (! function_exists("hex2bin")) {
  function hex2bin($hex) { return pack("H*" , $hex); }
}
if (! function_exists("bin2hex")) {
  function bin2hex($bin) {
    static $h = '0123456789ABCDEF';
    for ($i = 0; $i < strlen($bin); $i++) {
      $hex .= $h[ord($bin[$i])>>4].$h[ord($bin[$i]&0xF)];
    }
  }
}


class enmuster {

  /* ENTRY POINT 

     So, why use 'op' to identify the operation, rather than the URL? Well, it keeps the
     server side to one file and/or removes the need for URL rewriting. It also means the
     server logs don't identify what's going on too explicitly (they don't usually store
     POST data).
   */
  static function run() {
    if (isset($_POST) && ((int)$_SERVER['CONTENT_LENGTH']) > self::postmaxsize()) { 
      self::oops("maximum upload limit exceeded - you need to increase your post_max_size setting on the server");
    }
    if (empty($_POST['op'])) { self::oopsgoaway(); }
    $op = 'do_'.$_POST['op'];
    if (! method_exists('enmuster', $op))  { enmuster::oopsgoaway(); }
    if ($op != 'do_init' && $op != 'do_check') { self::auth(); }
    call_user_func(array('enmuster', $op));
  }

  /* operation entry functions, in the order they are received */

  static function do_check() { /* does nothing except check the server is reachable */ echo 'check'; }
    
  static function do_init() {
    if (! empty($_SERVER['REMOTE_USER'])) { enmuster::oops403($_SERVER['REMOTE_USER']); }
    if (empty($_POST['client'])) { enmuster::oops403('missing client'); }
    if (empty($_POST['project'])) { enmuster::oops403('missing project'); }
    $target = empty($_POST['target']) ? '' : $_POST['target'];
    enmuster::generate_session($_POST['client'], $_POST['project'], $target, empty($_POST['testmode']));
  }

  static function do_maintenanceon() {
    enmuster::maintenance(TRUE);
    $session = self::getsession();
    self::log(sprintf("MAINTENANCE ON: %s %s %s\nclient: %s\nproject: %s (%s)\ntoken: %s\n",
                      date('Y-m-d-H-i-s'), empty($_SERVER['HTTPS']) ? 'http' : 'https', 
                      $session->live ? 'LIVE' : 'TEST',
                      $session->client,
                      $session->project, empty($session->target) ? '-no target-' : $session->target, 
                      $session->token));
    enmuster::usermaintenance('on');
  }

  static function do_manifest() {
    self::log("manifest\n");
    echo self::httpencrypt(json_encode(
      self::directory(self::getprojectpath(), self::getexclusions(), '')
    ));
  }

  static function do_upload() {
    if (! isset($_POST['filenumber'])) { self::oops403("filenumber missing"); }
    $filenumber = $_POST['filenumber'];
    if (! is_numeric($filenumber)) { self::oops403("filenumber is not a number"); }
    if (! isset($_POST['relpath'])) { self::oops403("relpath missing"); }
    $relpath = self::httpdecrypt($_POST['relpath']);
    self::log("upload {$filenumber}: {$relpath}\n");
    enmuster::upload($filenumber);
  }

  static function do_update() {
    self::log("update\n");
    if (empty($_POST['manifest'])) { self::oops403("manifest missing"); }
    $manifest = json_decode(self::httpdecrypt($_POST['manifest']));
    if ($manifest === FALSE) { self::oops403('could not decode manifest'); }
    enmuster::update($manifest);
  }

  static function do_revision() {
    self::log("revision\n");
    echo self::httpencrypt(json_encode(self::updaterevision()));
  }

  static function do_upgrade() {
    self::log("upgrade\n");
    echo self::httpencrypt(json_encode(self::upgrade()));
  }

  static function do_maintenanceoff() {
    enmuster::usermaintenance('off');
    self::log("maintenance off\n\n");
    enmuster::maintenance(FALSE);
  }

  /* Errors: 
     400: a user could reasonably have got into this situation
       by not setting up correctly; this is the standard "oops"
       function, which can also supply a link into the help for more
       information in the client. 
     401: the authentication didn't go well
     403: a problem like failing to read or write that really shouldn't happen once we've checked 
       generally. However, out of disk might cause this for example, as might a bug, of course
     409: locked - someone else is doing a simultaneous update
     500: not used explicitly, but might arise if there were a bug this end that caused PHP throw an error
  */

  static function oops($m, $helplink=NULL) { 
    header("HTTP/1.0 400 Bad Request"); 
    header('Content-type: text/plain'); 
    echo $m;    
    if (! empty($helplink)) { echo "#{$helplink}"; }
    exit;
  }
  static function oops404() { header("HTTP/1.0 404 Page Not Found"); exit; }
  static function oops409($m) { 
    header("HTTP/1.0 409 Conflict"); 
    header('Content-type: text/plain'); 
    echo $m; 
    exit;
  }
  static function oops401($m) { error_log($m); header("HTTP/1.0 401 Not Authorized"); exit; }
  static function oops403($m) { error_log($m); header("HTTP/1.0 403 Forbidden"); exit; }
  static function oops500($m) { error_log($m); header("HTTP/1.0 500 Internal Server Error"); exit; }
  static function oopsgoaway() {
    /* if someone just accesses the URL without the relevant POST data, they just see this... */
    echo <<<EOD
<!doctype html>
<html>
<head>
</head>
<body>
<p>nothing to see here</p>
</body>
</html>
EOD;
    exit;
  }

  static function postmaxsize(){
    $p = trim(strtoupper(ini_get('post_max_size')));
    $v = (int)$p;
    switch ($p[strlen($p)-1]) {
    case 'T': $v *= 1024;
    case 'G': $v *= 1024;
    case 'M': $v *= 1024;
    case 'K': $v *= 1024;
    }
    return $v;
  }

  static function log($s) {
    file_put_contents(self::data()."/enmuster.log", $s, FILE_APPEND);
  }

  static function getsession() {
    /* the token in the request identifies the session (file), which identifies them and their project etc */
    static $session = NULL;
    if (empty($session)) {
      if (empty($_POST['token'])) { self::oops401('no token'); }
      $token = $_POST['token'];
      $path = self::sessionpath($token);
      if (! file_exists($path)) { self::oops404(); } 
      $session = json_decode(file_get_contents($path));
      if ($session === FALSE) { self::oops404(); } // should never arise, as we write it
    }
    return $session;
  }

  static function sessionpath($token) { return sprintf('%s/%s.session', self::data(), $token); }

  static function auth() {
    /* once secure communication has been established at the beginning, we check the
       encrypted token matches the palin text one on each request */
    if (empty($_POST)) { self::oops403('need POST'); }
    if (empty($_POST['token'])) { self::oops403('no token'); }
    if (empty($_POST['auth'])) { self::oops403('no auth'); }
    /* auth -> token when decrypted */
    $session = self::getsession();
    $authpath = sprintf("%s/%s.auth", self::data(), $_POST['token']);
    if (! file_put_contents($authpath, hex2bin($_POST['auth']))) {
      self::oops403('cannot write temporary auth file');
    }
    $token = shell_exec(sprintf("cat %s | openssl enc -des3 -d -pass 'pass:%s'",
                                escapeshellarg($authpath), $session->password));
    if (! @unlink($authpath)) { self::oops403('cannot remove auth file'); }
    if (empty($token)) { self::oops401('could not decrypt'); }
    if ($token != $session->token) { self::oops401('not the same token'); }
  }

  static function data() {
    if (! is_dir(ENMUSTER_DATA_DIRECTORY)) { self::oops('Enmuster Data Directory not found (or isn\'t a directory) - is the location set properly at the top of the server script?', 'edd'); }
    if (! is_writable(ENMUSTER_DATA_DIRECTORY)) { self::oops('Enmuster Data Directory is not writable: is it set up so the web server can write files to it? Remember the web server may not be running under the same account that you can log in or upload files manually with', 'edd'); }
    return ENMUSTER_DATA_DIRECTORY;
  }

  static function generate_session($client, $project, $target, $live) {
    /* creates the session file and credentials for ongoing communication */
    $pempath = sprintf('%s/%s.pem', self::data(), $client);
    if (! file_exists($pempath)) { self::oops("public key missing: you need to install your public key on the server's enmuster data directory as '{$client}.pem'", 'ssl'); }
    static $chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    $jo = new stdClass;

    /* invent a random token to identify the session */
    $jo->token = '';
    for (;;) {
      for ($i = 0; $i < 64; $i++) { $jo->token .= $chars[rand(0,strlen($chars)-1)]; }
      /* in the highly unlikely event of token already existing, go round again for another one */
      if (! file_exists(self::sessionpath($jo->token))) { break; }
    }

    /* invent a random password with which to encrypt further communication in this session */
    $jo->password = '';
    for ($i = 0; $i < 32; $i++) { $jo->password .= $chars[rand(0,strlen($chars)-1)]; }

    /* encrypt the password with the public key supplied by the client and send it back to them, 
       together with the plain text token */
    $j = json_encode($jo);
    $encrypted = shell_exec(sprintf("openssl rsautl -encrypt -pubin -inkey %s <<SSEOD\n%s\nSSEOD\n", 
                                    escapeshellarg($pempath), $j));
    if (empty($encrypted)) { self::oops('encryption failed - is openssl installed on your server?', 'ssl'); }

    /* save other information in the session file for later use */
    $jo->client = $client;
    $jo->project = $project;
    $jo->live = $live;
    if (! empty($target)) { $jo->target = $target; }
    if (! @file_put_contents(self::sessionpath($jo->token), json_encode($jo))) {
      /* we already checked existence and writing in principle, so this shouldn't happen, so a more
         terse message will do */
      self::oops403('cannot write session to Enmuster Data Directory');
    }

    header('Content-type: text/plain');
    echo bin2hex($encrypted); /* that is, the encryption of {"token":"...","password":"..."} */
    exit;
  }

  static function directory($dirpath, $exclusions, $relpath) {
    /* recursive scan of the target site files to create a manifest */
    $files = array();
    $d = dir($dirpath);
    if (empty($d)) { oops403("cannot open directory {$dirpath}"); }
    while (($entry = $d->read()) !== FALSE) {
      if ($entry == '.' || $entry == '..') { continue; }
      $rel = "{$relpath}/{$entry}";
      if (in_array($rel, $exclusions)) { continue; }
      $path = "{$dirpath}/{$entry}";
      $file = new stdClass();
      $file->name = $entry;
      $file->writable = is_writable($path);
      if (is_dir($path)) {
        $file->mtime = filemtime($path);
        $file->folder = self::directory($path, $exclusions, $rel);
      } else if (is_file($path)) {
        $file->size = filesize($path);
        $file->mtime = filemtime($path);
      }  else if (is_link($path)) {
        $file->link = readlink($path);
      } else {
        $file->unknown = TRUE;
      }
      $files[] = $file;
    }
    return $files;
  }

  static function getprojectpath() {
    $session = self::getsession();
    $projectlink = sprintf('%s/%s', self::data(), $session->project);
    if (! empty($session->target)) { 
      if (! is_dir($projectlink)) {
        self::oops("missing project directory: there needs to be a directory callled '{$session->project}' in enmuster's data directory containing links to each target directory (as given in the URL fragment after the hash)", 'edd');
      }      
      $projectlink .= "/{$session->target}"; 
      if (! is_link($projectlink) && ! is_file($projectlink)) {
        self::oops("missing target link: there needs to be a link (or a file containing just the directory name) called '{$session->project}/{$session->target}' in enmuster's data directory, referencing the location of the project's files", 'edd'); 
      }
    } else if (! is_link($projectlink) && ! is_file($projectlink)) { 
      self::oops("missing project link: there needs to be a link (or a file containing just the directory name) called '{$session->project}' in enmuster's data directory referencing the location of the project's files", 'edd');
    }    
    $path = is_link($projectlink) ? readlink($projectlink) : trim(file_get_contents($projectlink));
    if (empty($path)) { self::oops("project link cannot be read", 'edd'); }
    if (! file_exists($path)) { self::oops("project link not valid", 'edd'); }
    if (! is_dir($path)) { self::oops("project link does not reference a directory", 'edd'); }
    return $path;
  }

  static function getexclusions() {
    /* a list of relative paths which are not considered when compiling the server manifest */
    if (empty($_POST['exclusions'])) { return array(); }
    $names = array();
    $exclusions = json_decode(self::httpdecrypt($_POST['exclusions']));
    if ($exclusions === FALSE) { self::oops403('cannot decrypt and decode exclusions'); }
    foreach ($exclusions as $exclusion) { 
      $names[] = $exclusion->name;
    }
    return $names;
  }

  static function insecure() { return empty($_SERVER['HTTPS']); }

  static function httpencrypt($s) {
    /* there's a minor security flaw here in that the password is briefly exposed in commands like ps;
       however the password is only used for this session, so I let that pass for now. */
    if (! self::insecure()) { return $s; }
    $session = self::getsession();
    $path = sprintf('%s/%s.plaintext', self::data(), $session->token);
    if (! @file_put_contents($path, $s)) { self::oops403("cannot write temporary file '{$path}'"); }
    return bin2hex(shell_exec(sprintf("cat %s | openssl enc -des3 -e -pass 'pass:%s' ; rm %s",
                                      escapeshellarg($path), $session->password, escapeshellarg($path))));
  }
  static function httpdecrypt($s) {
    if (! self::insecure()) { return $s; }
    $session = self::getsession();
    $path = sprintf('%s/%s.cipher', self::data(), $session->token);
    if (! @file_put_contents($path, hex2bin($s))) { self::oops403("cannot write temporary file '{$path}'"); }
    return shell_exec(sprintf("cat %s | openssl enc -des3 -d -pass 'pass:%s' ; rm %s",
                              escapeshellarg($path), $session->password, escapeshellarg($path)));
  }
  static function httpdecryptfile($path) {
    if (! self::insecure()) { return; }
    $session = self::getsession();
    $escpath = escapeshellarg($path);
    $escpathnew = escapeshellarg("{$path}.new");
    return shell_exec(
      sprintf("cat %s | xxd -r -p | openssl enc -des3 -d -pass 'pass:%s' > %s.new; mv %s.new %s",
              $escpath, $session->password, $escpathnew, $escpathnew, $escpath));
  }


  static function maintenance($on) {
    /* lock the project so we're the only ones can work on it, and unlock it afterwards  */
    $session = self::getsession();
    $pathgreen = sprintf('%s/green.lock', self::data());
    $pathred = sprintf('%s/red.lock', self::data());
    if ($on) {
      if (@rename($pathgreen, $pathred)) {
        file_put_contents($pathred, $session->client);        
      } else { /* locked */
        $otherclient = @file_get_contents($pathred);
        if ($otherclient === FALSE) {
          /* can't read it: they probably just released the lock, but it's so unlikely it's not worth
             trying again automatically. However, this may be the first time, so if there is no log
             [sic] yet, create the lock */
          if (file_exists(self::data()."/enmuster.log")) {
            $otherclient = '[unknown]';
          } else {
            /* first time */
            file_put_contents($pathred, $session->client);
            $otherclient = $session->client;
          }
        }
        if ($otherclient != $session->client) {
          unlink(self::sessionpath($session->token));
          self::oops409("project is currently being updated by {$otherclient} - please try again in a few minutes - but you may need to update your files locally to reflect their change before doing so (if a previous update failed and left a lock on the server, see the help)");
        }
        /* oh! it was me - lock got left behind; though we might be doing it from two
           different places simultaneously, that's sily, so continue as if it worked */
      }
    } else {
      if (! @unlink(self::sessionpath($session->token))) { self::oops403("cannot remove session path"); }
      if (! @rename($pathred, $pathgreen)) { self::oops403("cannot release lock"); }
    }
    error_log("maintenance ".($on ? 'ON' : 'OFF'));
  }

  static function usermaintenance($onoff) {
    /* run the users' maintance mode file */
    if (empty($_POST['name'])) { return; }
    $session = self::getsession();
    $name = self::httpdecrypt($_POST['name']);
    $path = sprintf('%s%s', self::getprojectpath(), $name);
    if (! file_exists($path)) { return; }
    $dir = dirname($path);
    $header = @file_get_contents($path, FALSE, NULL, 0, 5);
    if ($header === FALSE) { self::oops("cannot read '{$path}' to turn maintenance {$onoff}", 'maint'); }
    if (substr($header, 0, 2) == "#!") {
      @chmod($path, 0744);
      $path = escapeshellarg($path);
    } else if ($header == '<'.'?php') {
      $path = sprintf('php %s', escapeshellarg($path));
    } else {
      self::oops("maintenance file '{$name}' does not start #! or <".'?\php', 'maint');
    }
    /* SO THIS IS POTENTIALLY RATHER DANGEROUS: */
    if ($session->live) {
      shell_exec(sprintf('cd %s ; %s %s', escapeshellarg($dir), $path, $onoff));
    }
  }

  static function uploadpath($createifnecessary=FALSE) {
    static $path = NULL;
    if (empty($path)) {
      $session = self::getsession();
      $path = sprintf('%s/%s.upload', self::data(), $session->token);
      if ($createifnecessary && ! is_dir($path)) {
        if (! @mkdir($path, 0700)) { self::oops403("cannot make temporary directory '{$path}'"); }
      }
    }
    return $path;
  }

  static function upload($filenumber) {
    /* collect the uploaded files and install them where the manifest says to put them */
    $session = self::getsession();

    if (empty($_FILES[0])) { self::oops403("no file uploaded"); }
    if (count($_FILES) > 1) { self::oops403("multiple files uploaded"); }
    $file = $_FILES[0];
    switch ($file['error']) {
    case 0:
    case UPLOAD_ERR_NO_FILE:
      break;
    case UPLOAD_ERR_INI_SIZE:
    case UPLOAD_ERR_FORM_SIZE:
      self::oops("File '{$file['name']}' was too big to transfer - you need to change both the POST upload limit and file upload size limit in the PHP settings on the server", 'size');
    case UPLOAD_ERR_PARTIAL:
      self::oops("file '{$file['name']}' was only partly transferred - something went wrong");
    default:
      self::oops('an unidentified error occurred while transferring your files');
    }

    $path = sprintf("%s/%d", self::uploadpath(TRUE), $filenumber);
    if (! @move_uploaded_file($file['tmp_name'], $path)) { 
      self::oops403("cannot copy uploaded file {$filenumber}");
    }
    self::httpdecryptfile($path);
    exit;
  }

  static function update($manifest) {
    /* install and remove files according to manifest */
    $log = self::installfiles($manifest, self::getprojectpath(), '/');

    /* remove temporary uploads */
    $uploadpath = self::uploadpath();
    if (is_dir($uploadpath) && ! @rmdir($uploadpath)) {
      /* it should be empty now, as the manifest moved all its files */
      self::oops403("cannot remove temporary directory '{$uploadpath}'");
    }

    echo self::httpencrypt(json_encode($log));
    exit;
  }

  static function installfiles($manifest, $projectpath, $relpath) {
    /* recursively install new versions of files demanded by the manifest, after uploading */
    $session = self::getsession();
    $log = array();
    static $filecount = 0;
    foreach ($manifest as $el) {
      $path = "{$projectpath}{$relpath}{$el->name}";
      if (! empty($el->isdrop)) {
        if (! file_exists($path)) { continue; /* odd, why doesn't it exist any more */}
        $isdirectory = is_dir($path);
        if ($isdirectory !== isset($el->folder)) { 
          self::oops("'{$path}' is a folder not a file or vice-versa!");
        }
        if ($session->live) {
          $logthis = 'deleted';
          self::backupfileorfolder($path, $relpath, $el);
        } else {
          $logthis = 'would have deleted';
        }
        self::log("{$logthis} {$relpath}{$el->name}\n");
        $log[] = sprintf("{$logthis} %s ...%s%s", $isdirectory ? 'directory' : 'file', $relpath, $el->name);
      } else if (isset($el->folder)) {
        if (! file_exists($path)) {
          if ($session->live) {
            $logthis = 'created';
            if (! @mkdir($path, 0755)) { self::oops("cannot make directory '{$path}'"); }
            if (! @touch($path, $el->mtime)) { self::oops("cannot set modified time for '{$path}'"); }
          } else {
            $logthis = 'would have created';
          }
          self::log("{$logthis} {$relpath}{$el->name}\n");
          $log[] = sprintf("{$logthis} directory ...%s%s", $relpath, $el->name);
        } else if (! is_dir($path)) {
          self::oops("{$folderpath} is not a folder!");
        }           
        $log = array_merge($log, self::installfiles($el->folder, $projectpath, "{$relpath}{$el->name}/"));
      } else if (isset($el->size)) {
        $replace = file_exists($path);
        if ($replace) { 
          if (! is_file($path)) { 
            self::oops("when trying to replace file {$path}, it is currently a directory"); 
          }
          if ($session->live) {
            $logthis = 'replaced';
            self::backupfileorfolder($path, $relpath, $el);
          } else {
            $logthis = 'would have replaced';
          }
        } else {
          $logthis = $session->live ? 'added' : 'would have added';
        }
        if (! isset($el->filenumber)) { self::oops403("missing filenumber in manifest for '{$el->name}'"); }
        if (! is_numeric($el->filenumber)) { self::oops403("filenumber in manifest is not a number for '{$el->name}'"); }
        $tmppath = sprintf('%s/%d', self::uploadpath(), $el->filenumber);
        if ($session->live) {
          if (! @rename($tmppath, $path)) { self::oops("cannot move '{$el->name}' to '{$path}' "); }
          if (! @touch($path, $el->mtime)) { self::oops("cannot set modified time for '{$path}'"); }
        } else {
          if (! @unlink($tmppath)) { self::oops("cannot remove temporary uploaded file for '{$el->name}'"); }
        }
        self::log("{$logthis} {$relpath}{$el->name}\n");
        $log[] = sprintf("%s file ...%s%s", $logthis, $relpath, $el->name);
      }
    }
    return $log;
  }

  static function backupfileorfolder($path, $relpath, $el) {
    /* we don't delete files, just move them to a dated directory in the Enmuster Data Directory */
    $session = self::getsession();
    static $backupdir = NULL;
    if (empty($backupdir)) {
      $backupdir = sprintf('%s/backup-%s%s-%s', ENMUSTER_DATA_DIRECTORY, $session->project, 
                           empty($session->target) ? '' : "-{$session->target}", date('Y-m-d-H-i-s'));
      if (! @mkdir($backupdir)) { 
        self::oops("cannot make directory for backing up removed files '{$backupdir}'");
      }
    }
    $tmppath = sprintf('%s/%s', $backupdir, str_replace('/', '|', substr($relpath,1).$el->name));
    if (! @rename($path, $tmppath)) { self::oops("cannot backup '{$path}' to '{$tmppath}'"); }
  }

  static function updaterevision() {
    /* Changes the revision number in the file identified by the client */
    $session = self::getsession();
    if (empty($_POST['name'])) { enmuster::oops403('missing name'); }
    $name = self::httpdecrypt($_POST['name']);
    $path = sprintf('%s%s', self::getprojectpath(), $name);
    if (! file_exists($path)) { enmuster::oops("revision file '...{$name}' missing on server", 'revisions'); }
    $contents = @file_get_contents($path);
    if ($contents === FALSE) { enmuster::oops("cannot read revision file '...{$name}'", 'revisions'); }
    if (! preg_match('/~revision~([^0-9]*)([0-9]+)/', $contents, $m)) {
      enmuster::oops("cannot find ~revision~ in revision file '...{$name}'", 'revisions');
    }
    $revision = empty($m[2]) ? 1 : (int)($m[2]) + 1;
    $time = filemtime($path);
    if ($session->live) {
      $logthis = 'revision updated';
      if (! @file_put_contents($path, 
                               preg_replace('/~revision~([^0-9]*)([0-9]+)/', "~revision~\${1}{$revision}",
                                            $contents)))
      {
        self::oops("cannot rewrite revision file after updating it", 'revisions');
      }
      /* make sure we don't postdate from their version or we'll get into trouble */
      if (! @touch($path, $time)) { self::oops("cannot set modified time for '{$path}'", 'revisions'); }
    } else {
      $logthis = 'would have updated revision';
    }
    return array('log'=>"{$logthis} to {$revision} in ...{$name}");
  }

  static function upgrade() {
    /* Runs a script which is part of the upload (specifically, a file
       just uploaded as a new file) which is intended to perform a
       change corresponding the the new files, for example a database
       restructuring */
    $session = self::getsession();
    if (empty($_POST['upgrades'])) { enmuster::oops403('missing upgrades'); }
    $upgrades = json_decode(self::httpdecrypt($_POST['upgrades']));
    if ($upgrades === FALSE) { enmuster::oops403('cannot decrypt upgrade'); }
    $projectpath = self::getprojectpath();
    $log = '';
    foreach ($upgrades as $upgrade) {
      $path = "{$projectpath}{$upgrade}";
      $dir = dirname($path);
      if (! file_exists($path)) { 
        $log .= "skipped executing '...{$upgrade}' (does not exist)\n"; 
        continue;
      }
      $header = file_get_contents($path, FALSE, NULL, 0, 5);
      if (substr($header, 0, 2) == "#!") {
        @chmod($path, 0744);
        $path = escapeshellarg($path);
      } else if ($header == '<'.'?php') {
        $path = sprintf('php %s', escapeshellarg($path));
      } else {
        $log .= "skipped executing '...{$upgrade}' (no #!)\n";
        continue;
      }
      $log .= "upgrading with '...{$upgrade}', says:\n";
      if ($session->live) {
        /* SO THIS IS RATHER DANGEROUS IF NOT DONE PROPERLY: */
        $log .= shell_exec(sprintf('cd %s ; %s 2>&1', 
                                   escapeshellarg($dir), 
                                   $path /* so stderr is delivered too */));
      } else {
        $log .= 'skipped because testing only';
      }
    }
    return array('log'=>$log);
  }
}

enmuster::run();
exit; // mostly the functions exit anyway so this is really redundant

?>