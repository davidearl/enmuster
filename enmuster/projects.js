/* These are the classes for the local data (as stored in localStorage) and the things you can do with
   them, including the big one, the conversation with the server */

var Projects = {
	Factory: function(a /* array of "bald" Project */) {
		var f = Object.create(Projects);
		f.projects = a.map(function(oo){ return Project.Factory(oo); });
		return f;
	},

	Load: function() {
		var jprojects = localStorage.projects;
		var projects = Projects.Factory(jprojects ? JSON.parse(jprojects) : [])
		projects.currentproject = localStorage.currentproject;
		if (! projects.currentproject) { projects.currentproject = ""; }
		return projects;
	},

	save: function() {
		localStorage.projects = JSON.stringify(
			this.projects.map(function(project){ return project.bald(); }));
	},

	each: function(fn){ 
		this.projects.forEach(function(project, i, a){ 
			fn(project); 
		});
	},
	eachIf: function(fn){ 
		for (var i in this.projects) {
			if (! fn(this.projects[i])) { return false; }
		}
		return true;
	},

	indexOf: function(name) {
		for (var i in this.projects) {
			if (this.projects[i].name == name) { return i; }
		}
		return -1;
	},

	getProject: function(name) { return this.projects[this.indexOf(name)]; },

	setCurrentProject: function(name) { 
		this.currentproject = name == null ? "" : name;
		localStorage.currentproject = this.currentproject;
	},
	currentProject: function() {
		if (! ("currentproject" in this)) { throw new Error("current project not set"); }
		var iproject = this.indexOf(this.currentproject);
		if (iproject < 0) { throw new Error("current project does not exist"); }
		return this.projects[iproject];
	},
	isCurrentProject: function(project){
		return this.currentproject && this.currentProject().name == project.name;
	},

	getFolderOfCurrent: function(i) { return this.currentProject().folders[i]; },
	getUrlOfCurrent: function(ifolder, iurl) { 
		return this.currentProject().getFolder(ifolder).getUrl(iurl);
	},

	reorderProjects: function(oldi, newi) { 
		this.projects.splice(newi, 0, this.projects.splice(oldi, 1)[0]);
	},
	removeProject: function(name) {
		var i = this.indexOf(name);
		if (i < 0) { return; }
		this.projects.splice(i, 1);
	},

	addProject: function(o){ this.projects.push(Project.Factory(o)); },
}

var Project = {
	Factory: function(o) { /* o: {name: "name", folders: [], deploy: bool} */
		var f = Object.create(Project);
		f.name = o.name;
		f.deploy = o.deploy;
		f.testmode = o.testmode ? true : false;
		f.folders = o.folders.map(function(oo){ return Folder.Factory(oo); });
		return f;
	},

	bald: function(){
		return { name: this.name, deploy: this.deploy, testmode: this.testmode,
				 folders: this.folders.map(function(folder){ return folder.bald(); }) };
	},

	Proforma: function() {
		var now = new Date();
		var name = now.getFullYear() + "-";
		var m = now.getMonth()+1; name += (m < 10 ? "0"+m : m) + "-";
		var d = now.getDate()+1; name += (d < 10 ? "0"+d : d) + " ";
		var h = now.getHours(); name += (h < 10 ? "0"+h : h) + ":";
		var m = now.getMinutes(); name += (m < 10 ? "0"+m : m) + ":";
		var s = now.getSeconds(); name += (s < 10 ? "0"+s : s);
		return 	{name: name,
				 folders: [],
				 deploy: true,
				 testmode: true,
				};
	},

	deployProject: function(helpers, cb){
		if (! this.deploy) { throw new Error("deployment turned off for this project"); }
		var self = this;
		self.helpers = helpers;
		self.helpers.progress("<p class='cinfodeploying'>"+
						 (self.testmode ? "TESTING DEPLOYMENT": "DEPLOYING")+" "+Util.h(self.name)+"</p>");
		Nasync.eachSeries(this.folders, 
						  function(folder, cbf){ folder.deployFolder(self, cbf) },
						  cb);
	},

	getFolder: function(i) { return this.folders[i]; },
	lengthFolders: function() { return	this.folders.length; },
	eachFolder: function(fn) { this.folders.forEach(function(folder, i, a){ fn(folder); }); },

	reorderFolders: function(oldi, newi) { 
		this.folders.splice(newi, 0, this.folders.splice(oldi, 1)[0]);
	},
	removeFolder: function(i) { this.folders.splice(i, 1); },
	addFolder: function(path) { this.folders.push(Folder.Factory(Folder.Proforma(path))); },

	setTestMode: function(on) { this.testmode = on; }
}

var Folder = {
	Factory: function(o) { /* o: {path: "D:\...", urls: [], 
								  exclusions: [{name: "..."}], excludepatterns: {}, deploy: bool,
								  upgrade: {}, revision: {name: "..."}, collapsed: bool, maintenance: {}
								  } */
		var f = Object.create(Folder);
		f.path = o.path;
		f.deploy = ("deploy" in o) ? o.deploy : true;
		f.collapsed = ("collapsed" in o) ? o.collapsed : false;
		f.urls = o.urls.map(function(oo){ return Url.Factory(oo); });
		f.exclusions = o.exclusions.map(function(oo){ return RelPath.Factory(oo)});
		if ("excludepatterns" in o) { f.excludepatterns = Patterns.Factory(o.excludepatterns); }
		if ("upgrade" in o) { f.upgrade = Pattern.Factory(o.upgrade); }
		if ("revision" in o) { f.revision = RelPath.Factory(o.revision); }
		if ("maintenance" in o) { f.maintenance = RelPath.Factory(o.maintenance); }
		return f;
	},

	bald: function() {
		var o = {path: this.path, 
				 deploy: this.deploy, 
				 collapsed: this.collapsed,
				 urls: this.urls.map(function(url){ return url.bald(); }),
				 exclusions: this.exclusions.map(function(exclusion){ return exclusion.bald(); }),
				 excludepatterns: this.excludepatterns.bald()};
		if (this.upgrade) { o.upgrade = this.upgrade.bald(); }
		if (this.revision) { o.revision = this.revision.bald(); }
		if (this.maintenance) { o.maintenance = this.maintenance.bald(); }
		return o;
	},
	
	Proforma: function(path) {
		return {path: path,
				urls: [],
				exclusions: [],
				excludepatterns: {patterns: "*.bak, *~, #*#, .svn, *.unused"},
				upgrade: {pattern: "*.upgrade"},
				deploy: true,
				collapsed: false};	 
	},

	deployFolder: function(project, cb){
		var self = this;
		if (! self.deploy) { return cb(null); }
		Nasync.eachSeries(this.urls, 
						  function(url, cbu){ url.deployToUrl(project, self, cbu); },
						  cb);
	},

	root: function(){ return this.path.replace(/\\/g, "/"); },

	getUrl: function(i) { return this.urls[i]; },
	lengthUrls: function() { return this.urls.length; },
	eachUrl: function(fn) { this.urls.forEach(function(url, i, a){ fn(url); }); },
	reorderUrls: function(oldi, newi) { this.urls.splice(newi, 0, this.urls.splice(oldi, 1)[0]); },
	removeUrl: function(i) { this.urls.splice(i, 1); },
	addUrl: function() { this.urls.push(Url.Factory(Url.Proforma())); },

	lengthExclusions: function() { return this.exclusions.length; },
	eachExclusion: function(fn) {
		this.exclusions.forEach(function(exclusion, i, a){ fn(exclusion /* a RelPath object*/); });
	},
	removeExclusion: function(i) { this.exclusions.splice(i, 1); },
	addExclusion: function(name) { this.exclusions.push(RelPath.Factory({name: name})); },
	matchAnyExclusion: function(name) {
		return this.exclusions.some(function(exclusion) { return exclusion.match(name); });
	},
	exclusionsJSON: function() {
		return JSON.stringify(this.exclusions.map(function(ex){ return ex.bald(); }));
	},

	setExcludePatterns: function(patterns) { 
		this.excludepatterns = Patterns.Factory({patterns: patterns});
	},

	setRevision: function(relpath) { this.revision = RelPath.Factory({name: relpath}); },
	removeRevision: function() { if ("revision" in this) { delete this.revision; } },

	setMaintenance: function(relpath) { this.maintenance = RelPath.Factory({name: relpath}); },
	removeMaintenance: function() { if ("maintenance" in this) { delete this.maintenance; } },

	setUpgrade: function(pattern) { this.upgrade = Pattern.Factory({pattern: pattern}); },
	removeUpgrade: function() { if ("upgrade" in this) { delete this.upgrade;} },
	matchUpgrade: function(name) {
		if (! ("upgrade" in this)) { return false; }
		return this.upgrade.match(name);
	},
}

var RelPath = {
	Factory: function(o) { // {name: "relativepath"}
		var f = Object.create(RelPath);
		f.name = o.name;
		return f;
	},

	bald: function() { return {name: this.name}; },

	match: function(name) { return this.name == name; },
}

var Pattern = {
	Factory: function(o) { /* {pattern: "*.php"} for example */
		var f = Object.create(Pattern);
		f.pattern = o.pattern;
		return f;
	},

	bald: function() { return {pattern: this.pattern}; },

	RegString: function(s) { // static function also used by Patterns
		return s.replace(/([^a-zA-Z0-9])/g, "\\$1").replace(/\\\*/g, ".*");
	},

	regexp: function(){
		/* converts a simple "*" wildcard in a file name (such as *.php) pattern to a 
		   proper javascript regexp (.*\.php) */
		if (! this.reg) { this.reg = new RegExp("^"+Pattern.RegString(this.pattern)+"$"); }
		return this.reg;
	},

	match: function(name){ /* does name match the pattern? */
		return name.match(this.regexp());
	},
}

var Patterns = {
	Factory: function(o) { /* comma separated simple patterns */
		var f = Object.create(Patterns);
		f.s = o.patterns;
		return f;
	},

	bald: function(){ return {patterns: this.s}; },

	patterns: function(){ return this.s.split(/, */g).map(function(s){ return s.trim(); }); },

	regexp: function(){
		if (! this.reg) {
			var ss = this.s.split(",").map(function(s){ return Pattern.RegString(s.trim()); });
			this.reg = new RegExp("^("+ss.join(")|(")+")$");
		}
		return this.reg;
	},

	match: function(name){ 
		if (this.s.length == 0) { return false; }
		return name.match(this.regexp());
	},
}

var Tunnel = {
	Factory: function(o) {
		/* o: {login: username, host: "domainname[:port], key: "privatekey"|"password"} */
		var f = Object.create(Tunnel); 
		f.login = o.login;
		f.host = o.host;
		f.key = o.key;
		return f;
	},
	
	bald: function(){ return {login: this.login, host: this.host, key: this.key}; },

	Proforma: function(){ return {login: "", host: "", key: ""}; },

	detailsGiven: function() { return this.login != "" && this.host != "" && this.key != ""; },

	connect: function(targeturl, cb) {
		/* connects to a ssh tunnel to the specified server:port through which the website url(s) are
		   subsequently accessed. This uses the ssh2 node module.
		   targeturl: Url object
		   cb: function(err, ?) to be called back on error or completion
		*/
		if (! this.detailsGiven()) { return cb("incomplete tunnel details"); }
		var Client = Nssh2.Client;
		var host = this.getHost();
		var config = {username: this.login, host: host.host, port: host.port, keepaliveInterval: 60000}; 
   
		if (this.key.indexOf("-----BEGIN") == 0) {
			config.agent = "pageant"; // for automatic pass phrase resolution
			config.privateKey = this.key;
		} else {
			config.password = this.key;
		}

		var self = this;
		self.disconnect();
		var pt = targeturl.parts();
		/* thank you https://github.com/mscdex/ssh2/issues/40 ... */
		try {
			self.client = new Client();
			self.client.on('ready', function() {
				//console.log('Client ready');
				self.server = Nnet.createServer(function(sock){
					// sock.pause();
					//console.log("server active "+pt.hostname+":"+pt.port);
					self.client.forwardOut(sock.remoteAddress, sock.remotePort, pt.hostname, pt.port, 
						function(err, stream){
							if (err) { cb(err); return; }
							//console.log("piping");
							sock.pipe(stream);
							stream.pipe(sock);
							// sock.resume();
							//console.log("piped");
						});
				}).listen(Tunnel.GetLocalPort(), function(){ 
					/* change URL to go via localhost through the tunnel instead of directly */
					targeturl.updatePostUrl(
						pt.protocol + "//localhost:" + Tunnel.GetLocalPort() + pt.pathname);
					cb(null);
				});
			});
			self.client.connect(config);
		} catch(err) {
			self.disconnect();
			cb(err);
		}
	},
	
	disconnect: function(){
		// console.log("disconnect tunnel");
		if (this.server) { this.server.close(); }
		if (this.client) { this.client.end(); }
		this.client = this.server = null;
	},

	getHost: function(){
		var parts = this.host.split(":");
		return parts.length > 1 ?
			{host: parts[0], port: parseInt(parts[1])} :
			{host: this.host, port: 22 };
	},

	GetLocalPort: function(){ return localStorage.localport ? localStorage.localport : 8002; },
	SaveLocalPort: function(port){ localStorage.localport = port; },
}

var Url = {
	Factory: function(o) { 
		/* o: {url: "https://...", deploy: bool, tunnel: {}} */
		var f = Object.create(Url);
		f.url = o.url;
		f.deploy = ("deploy" in o) ? o.deploy : true;
		f.strictSSL = ("strictSSL" in o) ? o.strictSSL : true;
		if ("tunnel" in o) { f.tunnel = Tunnel.Factory(o.tunnel); }
		return f;
	},
	
	bald: function(){
		var o = {url: this.url, deploy: this.deploy, strictSSL: this.strictSSL};
		if (this.tunnel) { o.tunnel = this.tunnel.bald(); }
		return o;
	},

	Proforma: function(){ return {url: "", deploy: true, strictSSL: true}; },

	toggleStrictSSL: function() { this.strictSSL = ! this.strictSSL},

	setTunnel: function(o) { this.tunnel = Tunnel.Factory(o ? o : Tunnel.Proforma()); },
	removeTunnel: function() { if ("tunnel" in this) { delete this.tunnel; } },

	parts: function() {
		/* thank you https://gist.github.com/jlong/2428561 */
		var a = $("<a>").attr("href", this.url).get(0);
		if (a.port == "") { a.port = a.protocol == "http:" ? 80 : 443; }
		return {
			protocol: a.protocol, // includes trailing : but not //, e.g. "http:"
			hostname: a.hostname, // e.g. "www.example.com"
			port: a.port == "" ? (a.protocol == "http:" ? 80 : 443) : parseInt(a.port), // ensures always set
			pathname: a.pathname, // includes leading /, e.g. "/index.html"
			search: a.search, // includes ?, e.g. "?foo=bar"
			hash: a.hash, // includes the hash, e.g. "#top"
			host: a.host // concatentaion of host[:port], e.g. "www.example.com" or "www.example.com:8080"
		};
	},

	localmanifest: function(lmanifest, relpath, folder, cb){
		var self = this;
		Nfs.readdir(folder.path+relpath, function(err, entries) {
			if (err && err.code == "ENOENT") { err = "your folder '"+folder.path+"' no longer exists"; }
			if (err) { return cb(err); }
			Nasync.each(entries, function(entry, cbeach){
				var rel = relpath+"/"+entry;
				var path = folder.path+rel;
				if (folder.matchAnyExclusion(rel) || folder.excludepatterns.match(entry)) {
					return cbeach(null);
				}
				Nfs.stat(path, function(err, stats){ 
					if (err){ return cbeach(err); }
					if (stats.isFile()) {
						lmanifest.add(ManifestFile.Factory({
							name: entry, 
							writable: false, 
							size: stats.size,
							mtime: ManifestItem.UtimeToMtime(stats.mtime),
						}));
						$("#impfilecount").text(++self.filecount);
						return cbeach(null);
					} else if (stats.isDirectory()) {
						var fmanifest = ManifestFolder.Factory({
							name: entry,
							writable: false,
							mtime: ManifestItem.UtimeToMtime(stats.mtime),
							folder: [],
						});
						self.localmanifest(fmanifest.folder, rel, folder, function(err){
							lmanifest.add(fmanifest);
							$("#impfoldercount").text(++self.foldercount);
							return cbeach(null);
						});
					} else {
						cbeach(null);
					}});
			},function(err){
				cb(null, lmanifest);
			});
		});
	},

	comparemanifests: function(manifest, lmanifest, relpath, folder) {
		var self = this;
		lmanifest.each(function(litem){
			if (litem.isFile()) {
				/* is it in manifest, and if so has it changed? */
				var mitem = manifest.get(litem.name);
				if (mitem) {
					if (! mitem.isFile()) {
						// uh oh, it was a directory (or other object), now it's a file
						return cb("changed from directory(?) to file: ..."+relpath+"/"+mitem.name);
					}
					if (! mitem.isWritable()) {
						return cb("file not writable on server: ..."+relpath+"/"+mitem.name);
					}
					if (mitem.size == litem.size && mitem.mtime == litem.mtime) {
						/* not interested in updating this file */
						manifest.removeIfPresent(mitem.name);
					} else {
						if (mitem.mtime > litem.mtime) {
							if (self.postdateds > 0) {
								self.helpers.progress("<p>"+Util.h("file '..."+relpath+"/"+mitem.name+"' also ")+
												 "<span class='cinfoproblem'>pre-dates</span>" + 
												 Util.h(" the version on the server")+"</p>");
							} else {
								self.helpers.progress("<p>"+Util.h("your copy of file '..."+relpath+"/"+mitem.name+"' ")+"<span class='cinfoproblem'>pre-dates the version on the server</span>"+Util.h(" so it has been updated elsewhere. That means your version is out of date and you'll likely overwrite another change if you continue. Investigate the cause. If you're certain this is not a problem, the easiest way to fix it is to delete it from the server and let Enmuster restore it, though your site will be without a file for a short while")+"</p>");
							}
							self.postdateds++;
						}
						/* update this file details to match local disk */
						if (mitem.size != litem.size) {
							mitem.differentsize = mitem.size;
							mitem.size = mitem.size;
						}
						if (mitem.mtime != litem.mtime) {
							mitem.differentmtime = mitem.mtime;
							mitem.mtime = litem.mtime;
						}
					}
				} else {
					/* it's a new file, not in the server manifest */
					/* if this is one of the upgrade files, we'll run it later on the server, 
					   so make a note of it */
					if (folder.matchUpgrade(litem.name)) { self.upgrades.push(relpath+"/"+litem.name); }
					/* and add it to manifest */
					litem.isnew = true;
					manifest.add(litem);
				}
			} else if (litem.isDirectory()) {
				/* is it in manifest */
				var mitem = manifest.get(litem.name);
				var isnew = mitem == null;
				if (! isnew) {
					if (! mitem.isDirectory()) {
						// uh oh, it was a file (or other object), now it's a directory
						return cb("changed from file(?) to directory: ..."+relpath+"/"+mitem.name);
					}
					/* compare the contents (note: none of this is asynchronous, so this will 
					   just return when done */
					self.comparemanifests(mitem.folder, litem.folder, relpath+"/"+mitem.name, folder);
				} else {
					/* it wasn't in the manifest, so add it */
					litem.isnew = true;
					manifest.add(litem);
				} /* and ignore any other disk object! */
			}
		}); /* end litems.each */

		/* note any manifest entries that aren't here locally for removal */
		manifest.each(function(mitem){
			if ((! mitem.isFile() && ! mitem.isDirectory()) || folder.excludepatterns.match(mitem.name)) { 
				/* ignore non-folders/files and pattern excluded files and folders (manifest
				   filtered out path exclusions on the server before it gave it to us) */
				manifest.removeIfPresent(mitem.name);
				return;
			}
			var isdrop = true;
			lmanifest.each(function(litem){ 
				if (litem.name == mitem.name) { isdrop = false; }
			});
			if (isdrop) { mitem.isdrop = isdrop; }
		});
	},

	check: function(cb){
		this.prepare();
		this.auth = null;
		this.post("check", "checking your url", {}, function(err, content){
			if (err) { return cb(err); }
			if (content != "check") { cb("when trying your url, we got some data but not what was expected - is this not an Enmuster server but some other site? - please correct it and try again"); }
			cb (null);
		});
	},

	prepare: function() {
		this.posturl = this.url.trim();
		var p = this.parts();
		this.virtualhost = p.hostname; // but different with a tunnel
		if (p.hash) {
			this.target = p.hash.substring(1);
			this.posturl = this.posturl.substring(0, this.posturl.indexOf("#"));
		}
		if (this.posturl.substring(this.posturl.length-1) != "/") { this.posturl += "/"; }
	},

	updatePostUrl: function(newurl){ this.posturl = newurl; /* substitution for tunnel */},

	post: function(op, opreadable, params, cb){	
		var self = this;
		var data = {op: op};
		var form = "form";
		for (var key in params) { 
			if (key == "formData") {
				if (params[key]) { form = key; }
				continue;
			}
			data[key] = params[key];
		}
		if (this.auth) {
			data.token = this.auth.token;
			data.auth = this.auth.auth;
		}
		var requestops = {url: this.posturl,
						  headers: {"Host": this.virtualhost,
									"User-Agent": "enmuster/0.1"},
						  strictSSL: this.strictSSL,
						  method: "POST",
						  encoding: "utf8"};
		
		requestops[form] = data;		
		Nrequest(requestops,
				 function(err, response, content) {
					 if (err) { 
						 if (err.code == "ENOENT") { 
							 return cb("wrong protocol: HTTPS not HTTP or vice-versa");
						 }
						 return cb(err);
					 }
					 if (response.statusCode != 200) {					 
						 return cb(new Error(response.statusCode == 409	|| response.statusCode == 400 ? 
											 content : 
											 "server says "+response.statusMessage+ " when "+opreadable));
					 }
					 cb(null, content);
				 });
	},
	
	insecure: function(){ return this.url.substring(0, 6) != "https:"; },

	encryptIfNecessary: function(s) {
		if (! this.insecure()) { return s; }
		return Util.encrypt(s, this.password);
	},

	decryptIfNecessary: function(s) {
		if (! this.insecure()) { return s; }
		return Util.decrypt(s, this.password);
	},

	deployToUrl: function(project, folder, cb) {
		/* this is the big one, the one that does most of the work */
		var self = this;
		if (! self.deploy) { return cb(null); }
		self.helpers = project.helpers;
		this.prepare();
		
		Nasync.times(self.tunnel ? 1 : 0, function(n, cbtunnel){
			self.helpers.progress("<p>"+Util.h("opening tunnel to server")+"</p>");
			self.tunnel.connect(self /* which gets modified */, cbtunnel);
		},function(err, a){
			if (err) { return cb(err); }

			self.password = null;
			self.auth = null;
			self.postdateds = 0;
			self.upgrades = [];
			self.turnedmaintenanceon = false;
			self.manifest = null;

			self.helpers.progress("<p class='cinfofolder'>"+Util.h("folder "+folder.path+" to "+self.url)+"</p>");

			Nasync.waterfall([
				function init(cb) {
					var data = {client: self.helpers.clientName, project: project.name};
					if (self.target) { data.target = self.target; }
					if (project.testmode) { data.testmode = true; }
					self.post("init", "initializing", data, function(err, encrypted) {
						if (err) { return cb(err); }
						// hex to binary...
						var binary = '';
						for(var i=0; i < encrypted.length-1; i+=2){
							binary += String.fromCharCode(parseInt(encrypted.substr(i, 2), 16));
						}
						try {
							session = JSON.parse(self.helpers.privateKey.decrypt(binary));
						} catch (err) {
							return cb("unable to get and decrypt a password from the server: you probably haven't installed your public key (see settings)");
						}
						self.password = session.password;
						self.auth = {token: session.token, 
									 auth: Util.encrypt(session.token, self.password)};
						cb(null);
					});
				},

				function maintenanceon(cb) {
					var data = folder.maintenance ? 
						{name: self.encryptIfNecessary(folder.maintenance.name)} : {};
					self.post("maintenanceon", "turning maintenance on", data, function(err, content) {
						if (err) { return cb(err); }
						self.turnedmaintenanceon = true;
						cb(null);
					});
				},

				function getservermanifest(cb) {
					/* while we could deal with any exclusions solely here, it makes the manifest huge
					   if one of them happens to contain extensive data on the server, so exclude on
					   server also... */
					
					var data = {exclusions: self.encryptIfNecessary(folder.exclusionsJSON())};
					self.post("manifest", "fetching manifest", data, function(err, content) {
						if (err) { return cb(err); }
						content = self.decryptIfNecessary(content);
						try { var jmanifest = JSON.parse(content); }
						catch(err) { return cb(new Error("cannot parse manifest json")); }				
						//.. cb(null, Manifest.Factory(jmanifest));
						self.manifest = Manifest.Factory(jmanifest);
						$("#impwaitforserver").remove();
					});
					$("#imp").remove();
					self.helpers.progress("<p id='imp'>looking for changes: scanned <span id='impfilecount'>0</span> files, <span id='impfoldercount'>0</span> folders<span id='impwaitforserver'>, waiting for server</p></p>");
					cb(null); /* note: this means it isn't wating for the server to complete, 
								 we'll prepare the local manifest in in parallel */
				},


				function getlocalmanifest(cb) {
					var lmanifest = Manifest.Factory([]);
					self.filecount = 0;
					self.foldercount = 0;
					self.localmanifest(lmanifest, "", folder, function(err){ cb(err, lmanifest); });
				},

				function waitforservermanifest(lmanifest, cb) {
					Nasync.until(function(){ return self.manifest ? true : false; },
								 function(cbuntil){ setTimeout(cbuntil, 10); },
								 function(err) { return cb(err, self.manifest, lmanifest); });
				},

				function compare(manifest, lmanifest, cb) {
					self.comparemanifests(manifest, lmanifest, '', folder);
					cb(null, manifest)
				},

				function upload(manifest, cb) {
					if (self.postdateds > 0) {
						self.helpers.progress(
							"<p class='cinfoproblem'>"+
								Util.h("not proceeding with deployment because of post-dated files")+"</p>");
						return cb("-postdate-");
					}

					/* from the (now slimmed down by processsubfolder) manifest, determine paths of all
					   files to be uploade, noting which ones they are in the manifest so we can
					   identify them on the server */
					var paths = [];
					var determinepaths = function(manifest, relpath) {
						manifest.each(function(mitem) {
							if (mitem.isdrop) { return; } // to be deleted on the server
							if (mitem.isDirectory()) {
								determinepaths(mitem.folder, relpath + mitem.name + "/");
							} else if (mitem.isFile()) {
								mitem.filenumber = paths.length;
								paths.push(relpath+mitem.name);
							}
						});
					}
					determinepaths(manifest, "/");
					self.helpers.progress("<p id='iupprogress'>uploading "+paths.length+" files</p>");
					var timer = setInterval(function(){
						$("#iupprogress").text($("#iupprogress").text()+".");
					}, 1000);
			
					var sendfile = function(i, relpath, readstream, temppath, cb){
						var data = {filenumber: i /* not encrypted */, 
									relpath: self.encryptIfNecessary(relpath),
									formData: true, 0: readstream};
						self.post("upload", "uploading", data, function(err) {
							/* on completion, close readstream and remove temporary encrypted file */
							if (err) { return cb(err); }
							readstream.destroy();
							temppath ? Nfs.unlink(temppath, cb) : cb(null);
						});
					}

					/* create streams from paths for upload, either making temporary encrypted
					   copies, or the originals if https; we still have to do this even if there
					   aren't any files, in order to do any removals and add any new folders */
					var tmpcount = 0;
					Nasync.eachSeries(
						paths,
						function(relpath, cb){
							var path = folder.root()+relpath;
							if (self.insecure()) {
								Nfs.readFile(path, "binary", function(err, data) {
									if (err) { return cb(err); }
									var pathencrypted = Ntemp.path();
									Nfs.writeFile(
										pathencrypted, Util.encrypt(data, self.password), 
										'utf8' /* it's hex data actually */, 
										function(err){
											if (err) { return cb(err); }
											sendfile(tmpcount++, relpath, 
													 Nfs.createReadStream(pathencrypted), 
													 pathencrypted, cb);
										});
								});
							} else {
								sendfile(tmpcount++, relpath, Nfs.createReadStream(path), null, cb);
							}
						},
						function(err){ 
							if (timer) { 
								clearInterval(timer); 
								$("#iupprogress").remove();
							}
							cb(err, manifest);
						}
					);
				},
			
				function update(manifest, cb) {
					/* though short and sweet, this is the function that really makes the changes 
					   on the server!*/
					var data = {manifest: self.encryptIfNecessary(manifest.json())};
					self.post("update", "updating", data, function(err, content) {
						if (err) { return cb(err); }
						cb(null, JSON.parse(self.decryptIfNecessary(content)));
					});
				},

				function revision(log, cb) {
					if (! folder.revision || log.length == 0) { return cb(null, log); }
					var data = {name: self.encryptIfNecessary(folder.revision.name)};
					self.post("revision", "updating revision number", data,
							  function(err, content) {
								  if (err) { return cb(err+log.join('|')); }
								  log.push(JSON.parse(self.decryptIfNecessary(content)).log);
								  cb(null, log);
							  });
				},

				function upgrade(log, cb) {
					if (self.upgrades.length == 0 || log.length == 0) { return cb(null, log); }
					var data = {upgrades: self.encryptIfNecessary(JSON.stringify(self.upgrades))};
					self.post("upgrade", "upgrading", data, 
							  function(err, content) {
								  if (err) { return cb(err); }
								  log.push(JSON.parse(self.decryptIfNecessary(content)).log);
								  cb(null, log);
							  });
				},

				function done(log, cb) {
					self.helpers.progress(
						log.length == 0 ?
							"<p>no changes needed to be made</p>" :
							"<ul class='cbullets'><li>"+
								Util.h(log.join('[sep]')).replace(/\[sep\]/g, "</li><li>").
								split("\n").join("<br>")+
							"</li></ul>");
					cb(null);
				}

				/* end of Nasync.waterfall array */
			], function(errwaterfall){			
				/* Nasync.waterfall callback */
				errwaterfall = errwaterfall == "-postdate-" ? null : errwaterfall;
				if (! self.turnedmaintenanceon) { 
					return cb(errwaterfall);
				}
				var data = folder.maintenance ? 
					{name: self.encryptIfNecessary(folder.maintenance.name)} : {};
				self.post("maintenanceoff", "turning maintenance off", data, function(err, content) {
					/* do it anyway irrespective of errors - we really want to close it down */
					self.turnedmaintenanceon = false;
					if (self.tunnel) { self.tunnel.disconnect(); }
					self.helpers.progress("<p class='cinfocomplete'>completed</p>");
					return cb(errwaterfall);
				});
			});
			
		});
	} /* end of Url.deploy() */
}
