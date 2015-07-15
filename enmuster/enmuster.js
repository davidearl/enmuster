var Util = {
    h: function(s) {
		/* escape text strings for html use (like htmlspecialchars in php) */
		return s.replace(/\&/g, "&amp;").replace(/\</g, "&lt;").replace(/\>/g, "&gt;");
    },

    encrypt: function(plaintext, password) {
		// see https://www.npmjs.com/package/node-forge#cipher
		var keySize = 24;
		var ivSize = 8;
		var salt = Nforge.random.getBytesSync(8);
		var derivedBytes = Nforge.pbe.opensslDeriveBytes(password, salt, keySize + ivSize);
		var buffer = Nforge.util.createBuffer(derivedBytes);
		var key = buffer.getBytes(keySize);
		var iv = buffer.getBytes(ivSize);
		var cipher = Nforge.cipher.createCipher('3DES-CBC', key);
		cipher.start({iv: iv});
		cipher.update(Nforge.util.createBuffer(plaintext, 'binary'));
		cipher.finish();
		var output = Nforge.util.createBuffer();
		output.putBytes('Salted__'); // (add to match openssl tool output) 
		output.putBytes(salt);
		output.putBuffer(cipher.output);
		return output.toHex();
    },

    decrypt: function(ciphertext, password) {
		input = Nforge.util.createBuffer(Nforge.util.hexToBytes(ciphertext), 'binary');
		input.getBytes('Salted__'.length);
		var salt = input.getBytes(8);
		var keySize = 24;
		var ivSize = 8; 
		var derivedBytes = Nforge.pbe.opensslDeriveBytes(password, salt, keySize + ivSize);
		var buffer = Nforge.util.createBuffer(derivedBytes);
		var key = buffer.getBytes(keySize);
		var iv = buffer.getBytes(ivSize); 
		var decipher = Nforge.cipher.createDecipher('3DES-CBC', key);
		decipher.start({iv: iv});
		decipher.update(input);
		var result = decipher.finish(); // check 'result' for true/false 
		if (! result) { return null; }
		return decipher.output.getBytes();
    },

	init: function(){
	},

	getUserAgent: function(){ return Ngui.App.manifest["user-agent"]; },
	getVersion: function(){ return Ngui.App.manifest.version; },
}

var enmuster = {

    deploy: function() {
		/* in response to the big orange button, run the current project (i.e. deploy its files) */
		this.showinfo(""); // so we can append to it
		try {
			var cp = projects.currentProject();
			cp.deployProject(
                {clientName: this.getClient(), 
				 error: this.showerror,
				 progress: this.appendinfo,
				 encrypt: this.encrypt, decrypt: this.decrypt,
				 privateKey: this.getprivatekey()}, 
				function(err){
					if (err) { enmuster.showerror(err); }
				});
		} catch(err) {
			enmuster.showerror(err);
		}
    },
	
    redraw: function(){
		$(".cprojects").empty();
		$("#icurrentproject").hide();
		var i = 0;
		projects.each(function(project){
			var jp = $("#pproject li").
				clone().
				prop({project: project.name}).
				attr({id: "iproject_"+(i++), enname: project.name}).
				appendTo(".cprojects");
			jp.find(".cprojectname").text(project.name);
			if (projects.isCurrentProject(project)) {
				jp.addClass("ccurrentproject");
				enmuster.drawproject(project);
			}
		});
    },
	
    drawproject: function(project) {
		$("#icurrentproject").show();
		$(".cprojectnameplain").text(project.name);
		$("#ifoldercount").text(project.lengthFolders() > 0 ? project.lengthFolders() : "none yet");
		$("#igo").
			toggleClass("cprojectteston", project.testmode == "test").
			attr("enhint", project.testmode == "test" ? "test project deployment" : "DEPLOY PROJECT!");
		var jf = $("#ifolders").empty();
		
		project.eachFolder(function(folder){
			var jfli = $("#pfolder li").clone();
			jfli.find(".cfoldername").text(folder.path);
			Nfs.stat(folder.path, function(err, stats){
				/* this can happily work asynchronously */
				jfli.find(".cfolderwarning").toggle(err || ! stats.isDirectory());
			});
			
			var jexs = jfli.find(".cexclusions");
			folder.eachExclusion(function(exclusion){		
				var jex = $("#pexclusion li").clone();
				jex.find(".cexclusionname").text("..."+exclusion.name);
				jex.appendTo(jexs);
			});
			
			var expats = folder.excludepatterns.patterns().join(", ");
			if (expats == "") { expats = "[none]"; }
			jfli.find(".cexcludepatternsplain").text(expats);
			
			var jurls = jfli.find(".curls");
			var turnedoff = 0;
			folder.eachUrl(function(url){
				if (! url.deploy) { turnedoff++; }
				var jurl = $("#purl li").clone();
				if (url.url == "") {
					jurl.find(".curlnameplain").hide();
					jurl.find(".cformurlname").show();
				} else {
					jurl.find(".curlnameplain").show().text(url.url);
				}
				
				jurl.find(".cselfsignedbutton").toggle(! url.insecure()).
					toggleClass("cselfsignedok", ! url.strictSSL);

				if (! url.tunnel) {
					$(jurl).find(".ctunneladdbutton").show();
					$(jurl).find(".ctunnel").hide();
				} else {
					var tunnel = url.tunnel;
					$(jurl).find(".ctunneladdbutton").hide();
					$(jurl).find(".ctunnel").show();
					var detailsgiven = tunnel.detailsGiven();
					jurl.find(".cformtunnelcredentials").toggle(! detailsgiven);
					jurl.find(".ctunnelnameplain").text(tunnel.host).toggle(detailsgiven);
					jurl.find(".cinputtunnellogin").val(tunnel.login);
					jurl.find(".cinputtunnelkey").val(tunnel.key);
					jurl.find(".cinputtunnelhost").val(tunnel.host);	
				}
				jurl.appendTo(jurls);
			});
			
			var jrevs = jfli.find(".crevisions");
			if (folder.revision) {
				jfli.find(".crevisionadd").hide();
				jfli.find(".crevision").show();
				jfli.find(".crevisionname").text("..."+folder.revision.name);
				Nfs.stat(folder.path+folder.revision.name, function(err, stats){
					/* this can happily work asynchronously */
					jfli.find(".crevisionwarning").toggle(err || ! stats.isFile());
				});
			} else {
				jfli.find(".crevisionadd").show();
				jfli.find(".crevision").hide();
			}
			
			if (folder.maintenance) {
				jfli.find(".cmaintenanceadd").hide();
				jfli.find(".cmaintenance").show();
				jfli.find(".cmaintenancename").text("..."+folder.maintenance.name);
				Nfs.stat(folder.path+folder.maintenance.name, function(err, stats){
					/* this can happily work asynchronously */
					jfli.find(".cmaintenancewarning").toggle(err || ! stats.isFile());
				});
			} else {
				jfli.find(".cmaintenanceadd").show();
				jfli.find(".cmaintenance").hide();
			}
			
			jfli.find(".cupgradeplain").
				text(folder.upgrade ? folder.upgrade.pattern : "[none]");
			
			var collapsed = folder.collapsed;
			jfli.find(".csection").toggle(! collapsed);
			jfli.find(".cfolderstate").toggleClass("cfolderiscollapsed", collapsed);
			var nurls = folder.lengthUrls();
			jfli.find(".cfoldercollapsed").toggle(collapsed).text(
				"to "+nurls+" url"+(nurls != 1?"s":"")+
					(turnedoff > 0 ? " ("+(turnedoff == nurls ? "all" : turnedoff)+
					 " of them turned off)" :"")+
					(folder.lengthExclusions() > 0 ? " (some folders excluded)": ""));
			jfli.appendTo(jf);
		}); // end eachFolder
		this.drawdeployments(project);
    },

    states: {all: "lgreen.png", some: "lyellow.png", none: "lred.png", na: "lgrey.png"},

    drawdeployments: function(project) {
		if (! project.deploy) {
			$("#icurrentdeploy").attr("enmusterdeploy", "none");
			$("#ifolders").find(".cfolderdeploy, .curldeploy").attr("enmusterdeploy", "na");
		} else {
			var jfolder = $("#ifolders .cfolder:first-child");
			project.eachFolder(function(folder){
				if (! folder.deploy) {
					jfolder.find(".cfolderdeploy").attr("enmusterdeploy", "none");
					jfolder.find(".curldeploy").attr("enmusterdeploy", "na");		
				} else {
					var jurl = jfolder.find(".curl:first-child");
					folder.eachUrl(function(url){
						jurl.find(".curldeploy").attr("enmusterdeploy", url.deploy ? "all" : "none");
						jurl = jurl.next();		    
					});
					jfolder.find(".cfolderdeploy").
						attr("enmusterdeploy", 
							 folder.lengthUrls() > 0 && 
							 jfolder.find(".curldeploy[enmusterdeploy=\"all\"]").length == 
							 folder.lengthUrls() ?
							 "all" : "some");
				}
				jfolder = jfolder.next();
			});
			
			$("#icurrentdeploy").
				attr("enmusterdeploy", 
					 project.lengthFolders() > 0 && 
					 $("#ifolders .cfolderdeploy[enmusterdeploy=\"all\"]").length == 
					 project.lengthFolders() ? 
					 "all" : "some");
		}
    },


    selectproject: function(name){
		projects.setCurrentProject(name);
		this.redraw();
    },
    deleteproject: function(jproject) {
		jproject.find(".cprojectconfirmdeletebutton").show(250);
    },
    reallydeleteproject: function(jproject) {
		var projectname = jproject.attr("enname");
		var iscurrent = projects.isCurrentProject(projects.getProject(projectname));
		projects.removeProject(projectname);
		if (iscurrent) { this.selectproject(null); }
		projects.save();
		this.redraw();
    },
    canceldeleteproject: function() { $(".cprojectconfirmdeletebutton").hide(250); },


    deletefolder: function(jfolder) {
		jfolder.find(".cfolderconfirmdeletebutton").show(250);
    },
    reallydeletefolder: function(jfolder) {
		projects.currentProject().removeFolder(jfolder.index());
		projects.save();
		this.redraw();
    },
    canceldeletefolder: function() { $(".cfolderconfirmdeletebutton").hide(250); },


    deleteexclusion: function(jexclusion) { jexclusion.find(".cexclusionconfirmdeletebutton").show(250); },
    reallydeleteexclusion: function(jexclusion) {
		projects.getFolderOfCurrent(jexclusion.closest(".cfolder").index()).
			removeExclusion(jexclusion.index());
		projects.save();
		this.redraw();
    },
    canceldeleteexclusion: function() { $(".cexclusionconfirmdeletebutton").hide(250); },


    deleteurl: function(jurl) {	jurl.find(".curlconfirmdeletebutton").show(250); },
    reallydeleteurl: function(jurl) {
		projects.getFolderOfCurrent(jurl.closest(".cfolder").index()).removeUrl(jurl.index());
		projects.save();
		this.redraw();
    },
    canceldeleteurl: function() { $(".curlconfirmdeletebutton").hide(250); },


    deletetunnel: function(jtunnel) { jtunnel.find(".ctunnelconfirmdeletebutton").show(250); },
    reallydeletetunnel: function(jtunnel) {
		projects.getUrlOfCurrent(jtunnel.closest(".cfolder").index(), jtunnel.closest(".curl").index()).
			removeTunnel();
		projects.save();
		this.redraw();
    },
    canceldeletetunnel: function() { $(".ctunnelconfirmdeletebutton").hide(250); },


    deleterevision: function(jfolder) { jfolder.find(".crevisionconfirmdeletebutton").show(250); },
    reallydeleterevision: function(jfolder) {
		projects.getFolderOfCurrent(jfolder.index()).removeRevision();
		projects.save();
		this.redraw();
    },
    canceldeleterevision: function() { $(".crevisionconfirmdeletebutton").hide(250); },


    deletemaintenance: function(jfolder) { jfolder.find(".cmaintenanceconfirmdeletebutton").show(250); },
    reallydeletemaintenance: function(jfolder) {
		projects.getFolderOfCurrent(jfolder.index()).removeMaintenance();
		projects.save();
		this.redraw();
    },
    canceldeletemaintenance: function() { $(".cmaintenanceconfirmdeletebutton").hide(250); },


    newproject: function(){
		var o = Project.Proforma();
		projects.addProject(o)
		projects.setCurrentProject(o.name);
		projects.save();
		this.redraw();
    },

    editprojectname: function() {
		$(".cformprojectname, .cprojectnameplain").toggle();
		$(".cinputprojectname").val($(".cprojectnameplain").text()).focus().select();
    },
    changeprojectname: function() {
		var project = projects.currentProject();
		var newname = $(".cinputprojectname").removeClass("cactive").val();
		$(".cformprojectname, .cprojectnameplain").toggle();
		if (project.name == newname) { return; /* no change */}
		// check name doesn't exist elsewhere
		if (! projects.eachIf(function(p){
			if (p.name == project.name) { return true; }
			return p.name != newname;
		})) {
			$(".cinputprojectname").val(newname);
			enmuster.showerror("'"+newname+"' is already in use: please choose a different name");
			return;
		}
		project.name = newname;
		projects.setCurrentProject(newname);
		projects.save();
		this.redraw();
    },

    dropfolder: function(path, stats, jfolder) {
		if (! stats.isDirectory()) { enmuster.showerror("not a folder"); }
		jfolder == null ?
			projects.currentProject().addFolder(path) : 
			projects.getFolderOfCurrent(jfolder.index()).path = path;
		projects.save();
		enmuster.redraw();
    },
	
    dropexclusion: function(path, stats, jfolder, jexclusion) {
		var project = projects.currentProject();
		var folder = project.getFolder(jfolder.index());
		if (folder.path == path) { 
			return this.showerror("file or folder cannot be the same as the main folder");
		}
		if (path.indexOf(folder.path+"\\") != 0) { 
			return this.showerror("file or folder must be inside the main folder"); 
		}
		var relpath = path.substring(folder.path.length).replace(/\\/g, "/");
		jexclusion == null ?
			folder.addExclusion(relpath) : 
			folder.exclusions[jexclusion.index()].name = relpath;
		projects.save();
		this.redraw();    
    },

    editexcludepatterns: function(jfolder) {
		var jn = jfolder.find(".cexcludepatternshead");
		jn.find(".cformexcludepatterns").show();
		var text = jn.find(".cexcludepatternsplain").hide().text();
		if (text == "[none]") { text = ""; }
		jn.find(".cinputexcludepatterns").val(text).focus().select();
    },
    changeexcludepatterns: function(jfolder) {	
		var folder = projects.getFolderOfCurrent(jfolder.index());
		var jn = jfolder.find(".cexcludepatternshead");
		var newpatterns = jn.find(".cinputexcludepatterns").val();
		jn.find(".cexcludepatternsplain, .cformexcludepatterns").toggle();
		// check things about pattern
		folder.setExcludePatterns(newpatterns);
		projects.save();
		this.redraw();
    },


    addurl: function(jfolder) {
		projects.getFolderOfCurrent(jfolder.index()).addUrl();
		projects.save();
		this.redraw();    
    },
    editurl: function(jurl) {
		var jn = jurl.find(".curlname");
		jn.find(".cformurlname, .curlnameplain").toggle();
		jn.find(".cinputurlname").val(jn.find(".curlnameplain").text()).focus().select();
    },
    changeurl: function(jurl) {
		//var iproj = this.cp();
		var jn = jurl.find(".curlname");
		var newurl = jn.find(".cinputurlname").val();
		var url = projects.getUrlOfCurrent(jurl.closest(".cfolder").index(),jurl.index());
		jn.find(".curlnameplain, .cformurlname").toggle();
		if (url.url == newurl) { return; }
		// check things about url, access etc, and that it even looks like a url
		var oldurl = url.url;
		url.url = newurl;
		var oldstrictssl = url.strictSSL;
		if (! url.tunnel) {
			/* we won't check it with a tunnel just yet, but ideally we would */
			url.strictSSL = false; // just while we check
			url.check(function(err){
				url.strictSSL = oldstrictssl;
				if (err) {
					enmuster.showerror(err);
					url.url = oldurl;
					enmuster.editurl(jurl);
					jurl.find(".curlname .cinputurlname").val(newurl);
					return;
				}
				enmuster.finishchangeurl(url);		
			});
		} else {
			enmuster.finishchangeurl(url);
		}
    },
    finishchangeurl: function(url) {
		projects.save();
		this.redraw();
		
		this.showinfo("copy the following public key onto the server", "<p>&bull; this is used to demonstrate you are permitted to access this location and is used to encrypt when no https or ssh channel is available</p><p>&bull; you can also collect, revoke and regenerate the key pair from settings</p><p>&bull; keep the private key stored with this app safe &ndash; it gives the same level of access to your server as other ways of accessing and executing files on it!</p><p id='iinfokeywait' style='color: tomato; text-align: center;'>making key<br>please wait<br>this may take a short while</p><p id='iinfopublickey'></p>");
		setTimeout(function(){
			$("#iinfokeywait").remove();
			$("#iinfopublickey").html("<textarea>"+enmuster.getpem()+"</textarea>");
			$("#iinfopublickey textarea").css({width: "90%", height: "160px", fontSize: "10px"}).
				select().focus();
		}, 500);
    },


	togglestrictssl: function(jurl) {
		projects.getUrlOfCurrent(jurl.closest(".cfolder").index(), jurl.index()).toggleStrictSSL();
		projects.save();
		this.redraw();
	},
	

    addtunnel: function(jurl) {
		projects.getUrlOfCurrent(jurl.closest(".cfolder").index(), jurl.index()).setTunnel();
		projects.save();
		this.redraw();
    },
    edittunnel: function(jurl) {
		var jn = jurl.find(".ctunneldetails");	
		var tunnel = projects.getUrlOfCurrent(jurl.closest(".cfolder").index(), jurl.index()).tunnel;
		jn.find(".cformtunnelcredentials, .ctunnelnameplain").toggle();
		jn.find(".cinputtunnellogin").val(tunnel.login);
		jn.find(".cinputtunnelkey").val(tunnel.key);
		jn.find(".cinputtunnelhost").val(tunnel.host).focus().select();
    },
    changetunnel: function(jurl) {
		var jn = jurl.find(".cformtunnelcredentials");
		var newtunnel = {login: jn.find(".cinputtunnellogin").val(),
						 key: jn.find(".cinputtunnelkey").val(),
						 host: jn.find(".cinputtunnelhost").val()};
		var url = projects.getUrlOfCurrent(jurl.closest(".cfolder").index(), jurl.index());
		var tunnel = url.tunnel;
		$(".cformtunnelcredentials, .ctunnelnameplain").toggle();
		if (tunnel.login == newtunnel.login && 
			tunnel.key == newtunnel.key &&
			tunnel.host == newtunnel.host) 
		{ 
			return;
		}
		// check things about tunnel, access etc, and that it even looks like a host/port
		url.setTunnel(newtunnel);
		projects.save();
		this.redraw();
    },
	syncurl: function(jurl) {
		var project = projects.currentProject();
		var ifolder = jurl.closest(".cfolder").index();		
		var folder = projects.getFolderOfCurrent(ifolder);
		var url = projects.getUrlOfCurrent(ifolder, jurl.index());
		
		this.showinfo(""); // so we can append to it
		try {
			url.syncFromUrl( 
                {clientName: this.getClient(), 
				 error: this.showerror,
				 progress: this.appendinfo,
				 encrypt: this.encrypt, decrypt: this.decrypt,
				 privateKey: this.getprivatekey()}, 
				project, folder,
				function(err){
					if (err) { enmuster.showerror(err); }
				});
		} catch(err) {
			enmuster.showerror(err);
		}
	},

    getClient: function() {
		/* make a clientname if we don't have one already */
		if (! localStorage.clientname) {
			var Nos = require("os");
			localStorage.clientname = Nos.hostname();
		}
		return localStorage.clientname;
    },
    saveClient: function(clientname) { localStorage.clientname = clientname; },
	

    droprevision: function(path, stats, jfolder) {
		var folder = projects.getFolderOfCurrent(jfolder.index());
		if (path.indexOf(folder.path) != 0) { 
			return this.showerror("file needs to be in the main folder or one of its descendants"); 
		}
		Nfs.readFile(path, {encoding: "binary"}, function(err, data){
			if (err) { return enmuster.showerror("we aren't able to read that file"); }
			if (data.indexOf("~revision~") < 0) {
				return enmuster.showerror("the file needs to contain '~revision~' which will be substituted with the revision number on the server");
			}
			folder.setRevision(path.substring(folder.path.length).replace(/\\/g, "/"));
			projects.save();
			enmuster.redraw();
		});
    },
	
    dropmaintenance: function(path, stats, jfolder) {
		var folder = projects.getFolderOfCurrent(jfolder.index());
		if (path.indexOf(folder.path) != 0) { 
			return this.showerror("file needs to be in the main folder or one of its descendants"); 
		}
		Nfs.readFile(path, {encoding: "binary"}, function(err, data){
			if (err) { return enmuster.showerror("we aren't able to read that file"); }
			if (data.substring(0,2) != "#!" && data.substring(0,5) != "<"+"?"+"php") {
				return enmuster.showerror("the file needs to start #! or <\?\php");
			}
			folder.setMaintenance(path.substring(folder.path.length).replace(/\\/g, "/"));
			projects.save();
			enmuster.redraw();
		});
    },
	

    editupgrade: function(jfolder) {
		var jn = jfolder.find(".cupgradehead");
		jn.find(".cformupgrade").show();
		var text = jn.find(".cupgradeplain").hide().text();
		if (text == "[none]") { text = ""; }
		jn.find(".cinputupgrade").val(text).focus().select();
    },
    changeupgrade: function(jfolder) {
		var folder = projects.getFolderOfCurrent(jfolder.index());
		var jn = jfolder.find(".cupgradehead");
		var newpattern = jn.find(".cinputupgrade").val();
		jn.find(".cupgradeplain, .cformupgrade").toggle();
		// check things about pattern
		newpattern == "" || newpattern == "[none]" ? folder.removeUpgrade() : folder.setUpgrade(newpattern);
		projects.save();
		this.redraw();
    },
	

    changeprojectdeploy: function() {
		var project = projects.currentProject();
		project.deploy = ! project.deploy;
		projects.save();
		this.drawproject(projects.currentProject());    
    },
    changefolderdeploy: function(jfolder) {
		var folder = projects.getFolderOfCurrent(jfolder.index());
		folder.deploy = ! folder.deploy;
		projects.save();
		this.drawproject(projects.currentProject());    
    },
    changeurldeploy: function(jurl) {
		var url = projects.getUrlOfCurrent(jurl.closest(".cfolder").index(), jurl.index());
		url.deploy = ! url.deploy;
		projects.save();
		this.drawproject(projects.currentProject());
    },


	testproject: function(jel){
		var cp = projects.currentProject();
		cp.setTestMode(cp.testmode == "test" ? "live" : "test");
		projects.save();
		this.drawproject(projects.currentProject());
	},

	shareproject: function(){
	    $("#iprojectshare").
			attr("nwsaveas", projects.currentProject().name+".enmuster.json").
			trigger("click");
	},
	saveprojecttodisk: function(jel){
	    if (jel[0].files.length == 0) { return; }
		var path = jel[0].files[0].path; /* not usually available, only in nw.js */
		var stripCredentials = function(o) {
			for (var i in o) {
				if (i == "login" || i == "key") {
					delete o[i];
				} if (o instanceof Object) {
					stripCredentials(o[i]);
				} else if (o[i] instanceof Array) {
					o[i].forEach(stripCredentials);
				}
			}
		}
		var o = projects.currentProject().bald();
		stripCredentials(o);
	    Nfs.writeFile(path, JSON.stringify(o),
					  function(err){ 
						  if (err) { return enmuster.showerror("cannot save current project to '"+path+"'"); }
						  enmuster.showinfo("saved project to '"+path+"'");
						  enmuster.appendinfo("<p>&bull;"+Util.h(" to import on another computer, drag the file onto the + button at the top")+"</p>");
					  });
	},
	importproject: function(path, stats) {
		Nfs.readFile(path, function(err, data){
			if (err) { return enmuster.showerror("cannot read file '"+path+"'"); }
			var jp;			
			try { jp = JSON.parse(data); }
			catch(err) { return enmuster.showerror("cannot parse JSON in '"+path+"'"); }
			if (! ("name" in jp)) { return enmuster.showerror("that doesn't look like an enmuster project"); }
			if (projects.indexOf(jp.name) >= 0) { return enmuster.showerror("project '"+jp.name+"' already exists: you'll need to delete or rename the old one before you can import"); }
			try { projects.addProject(jp); } catch(err) { return enmuster.showerror("cannot import project '"+jp.name+"' from '"+path+"'"); }
			projects.setCurrentProject(jp.name);
			projects.save();
			enmuster.redraw();
			enmuster.showinfo("imported project '"+jp.name+"'");
			enmuster.appendinfo("<p>&bull;"+Util.h(" it's unlikely your folder(s) will be in the same place if you are importing on a different computer, so you may need to drag the relevant folders onto he folder names to update them, where indicated")+"</p>");
			enmuster.appendinfo("<p>&bull;"+Util.h(" when importing on another computer you will need to put its public key onto the server - see settings")+"</p>");
			enmuster.appendinfo("<p>&bull;"+Util.h(" any tunnels have had their credentials removed, you will need to add yours")+"</p>");
		});
	},


    showerror: function(err /* error object or message */) {
		// $("#iinfo").hide();
		var text = err.message ? err.message : err;
		/* if there's a hash-something in the message, link to help */
		var r = /#([a-z0-9\-])+/;
		var info = text.match(r);
		$("#ierrorhelplink").hide();
		if (info) { 
			text = text.replace(r, "");
 			$("#ierrorhelplink").show().find(".chelpme").attr("enhash", "error-"+info[0].substring(1));
		}
		$("#ierrormessage").text(text);
		$("#ierrorclosebutton").one("click", function() { $("#ierror").hide(250); });
		$("#ierror").show(250);
    },
    showinfo: function(err /* error object or message */, h /* some html to follow if set */) {
		$("#iinfomessage").text(err.message ? err.message : err);
		h ? $("#iinfohtml").html(h) : $("#iinfohtml").empty();
		$("#iinfoclosebutton").one("click", function() { $("#iinfo").hide(250); });
		$("#iinfo").show(250);
    },
    appendinfo: function(h) {
		$(h).appendTo("#iinfohtml");
    },


    showsettings: function() {
		$("#isettingsclosebutton").one("click", function() { $("#isettings").hide(250); });
		$("#isettings").show(250);
    },

    getpem: function() {
		/* make a keypair if we don't have one already */
		if (! localStorage.publicpem) {
			var rsa = Nforge.pki.rsa;
			var kp = rsa.generateKeyPair({bits: 2048, e: 0x10001});
			localStorage.privatepem = Nforge.pki.privateKeyToPem(kp.privateKey);
			localStorage.publicpem = Nforge.pki.publicKeyToPem(kp.publicKey);
		}
		return localStorage.publicpem;
    },
    getprivatekey: function() { 
		var pki = Nforge.pki;    
		if (! localStorage.publicpem) { this.getpem(); }
		return pki.privateKeyFromPem(localStorage.privatepem);
    },
    deletekeypair: function() { localStorage.removeItem("keypair"); localStorage.removeItem("pem"); },

    helpchange: function() {
		enmuster.helptimer = null;
		localStorage.helppos = JSON.stringify({x: enmuster.helpwindow.x, y: enmuster.helpwindow.y, 
											   width: enmuster.helpwindow.width, 
											   height: enmuster.helpwindow.height});
    },	
    sethelptimer: function() {
		if (enmuster.helptimer) { clearTimeout(enmuster.helptimer); }
		enmuster.helptimer = setTimeout(enmuster.helpchange, 100);
    },
    
    help: function(anchor) {   
		if (enmuster.helpwindow) { 
			enmuster.helpwindow.show();
			if (anchor) { enmuster.helpwindow.window.location.hash = anchor; }
		} else {
			var helppos = localStorage.helppos ? JSON.parse(localStorage.helppos) : 
				{width: 1000, height: 600, x: 20, y: 20};
			helppos.title = "Using Enmuster";
			helppos.icon = "enmuster48i.png";
			helppos.toolbar = enmuster.dodebug;
			url = 'help.html';
			if (anchor) { url += "#"+anchor; }
			enmuster.helpwindow = Ngui.Window.open(url, helppos);
			enmuster.helpwindow.on("close", function(){ enmuster.helpwindow = null; this.close(true); });
			enmuster.helpwindow.on("resize", function(){ enmuster.sethelptimer(); });
			enmuster.helpwindow.on("move", function(){ enmuster.sethelptimer(); });
		}
    },

    settingschange: function() {
		enmuster.settingstimer = null;
		localStorage.settingspos = 
			JSON.stringify({x: enmuster.settingswindow.x, y: enmuster.settingswindow.y, 
							width: enmuster.settingswindow.width, 
							height: enmuster.settingswindow.height});
    },
    setsettingstimer: function() {
		if (enmuster.settingstimer) { clearTimeout(enmuster.settingstimer); }
		enmuster.settingstimer = setTimeout(enmuster.settingschange, 100);
    },

    settings: function() {   
		if (enmuster.settingswindow) { 
			enmuster.settingswindow.show();
		} else {
			var settingspos = localStorage.settingspos ? JSON.parse(localStorage.settingspos) : 
				{width: 600, height: 600, x: win.x+40, y: win.y+40};
			settingspos.title = "Using Enmuster";
			settingspos.icon = "enmuster48s.png";
			settingspos.toolbar = enmuster.dodebug;
			url = 'settings.html';
			enmuster.settingswindow = Ngui.Window.open(url, settingspos);
			enmuster.settingswindow.on("close", function(){ 
				enmuster.settingswindow = null; this.close(true); });
			enmuster.settingswindow.on("resize", function(){ enmuster.setsettingstimer(); });
			enmuster.settingswindow.on("move", function(){ enmuster.setsettingstimer(); });
			enmuster.settingswindow.on("loaded", function() { 
				enmuster.settingswindow.window.parentenmuster(enmuster); 
			});
		}
    },

    togglefolderstate: function(jfolderstate) {
		var folder = projects.getFolderOfCurrent(jfolderstate.closest(".cfolder").index()).collapsed = 
			! jfolderstate.hasClass("cfolderiscollapsed");
		projects.save();
		this.drawproject(projects.currentProject());
    },

    load: function(){
		var jprojects = localStorage.projects;
		projects = projects ? JSON.parse(projects) : [];
		var currentproject = localStorage.currentproject;
		if (! currentproject) { currentproject = ""; }
    },

	setdebug: function() {
		enmuster.dodebug = true;
		win.showDevTools();
	},

	checkforupdates: function() {
		if (localStorage.nextversioncheck &&
			Date.now() < parseInt(localStorage.nextversioncheck)) { return; }
		Nrequest({url: "http://enmuster.net/installers/latest.json", 
				  headers: {"User-Agent": Util.getUserAgent()}, method: "GET", encoding: "utf8"},
				 function(err, response, content){
					 if (err || response.statusCode != 200) { return; }
					 try{
						 var j = JSON.parse(content);
						 if (j.version != Util.getVersion()) {
							 enmuster.showinfo("A message from Enmuster");
							 enmuster.appendinfo(j.info);
						 }
						 localStorage.nextversioncheck = Date.now() + 7 * 24 * 60 * 60 * 1000; // a week
					 } catch(err){}
				 });
	},

    init: function() {
		enmuster.dodebug = Ngui.App.manifest.debug ? true : false;
		Util.init();

		$("#iprojects").
			on("click", ".cprojectname", function(e){ 
				enmuster.selectproject($(this).closest(".cproject").prop("project"));
			}).
			on("click", ".cprojectdeletebutton", function(e){
				enmuster.deleteproject($(this).closest(".cproject"));
			}).
			on("click", ".cprojectreallydeletebutton", function(e){
				enmuster.reallydeleteproject($(this).closest(".cproject"));
			}).
			on("click", ".cprojectcanceldeletebutton", function(e){
				enmuster.canceldeleteproject($(this).closest(".cproject"));
			});
		
		$("#inewprojectbutton").click(function(){ enmuster.newproject(); });
		
		$(".cprojectnameplain").click(function(e){
			enmuster.editprojectname();
		});
		$(".cformprojectname").submit(function(e){
			e.preventDefault(); e.stopPropagation();
			$(this).find("input").blur();
			enmuster.changeprojectname();
		});
		
		$("#igo").click(function(e){ enmuster.deploy(); });
		$("#ihelp").click(function(e){ enmuster.help(); });
		$("#isettings").click(function(e){ 
			e.ctrlKey ? enmuster.setdebug() : enmuster.settings(); 
		});
		$("#iprojectshare").change(function(e){ enmuster.saveprojecttodisk($(this)); });
		
		$("body").
			on("click", ".chelpme", function(e){
				enmuster.help($(this).attr("enhash"));
			}).
			on("mouseenter", ".cclick", function(){
				var hint = $(this).attr("enhint");
				if (! hint) { return; }
				$("#ihint").text(hint).show();
			}).
			on("mouseleave", ".cclick", function(){
				$("#ihint").hide();
			});

		$("#icurrentproject").
			on("click", ".chelpme", function(e){
				enmuster.help($(this).attr("enhash"));
			}).
			on("click", ".cprojectshare", function(e){
				enmuster.shareproject();
			}).
			on("click", ".cprojecttest", function(e){
				enmuster.testproject($(this));
			}).
			on("click", ".cfolderstate", function(e){
				enmuster.togglefolderstate($(this));
			}).
			on("click", ".cfoldername", function(e){
				enmuster.showerror("to update the folder, drag the new folder onto the old name");
			}).
			on("click", ".cfolderdeletebutton", function(e){
				enmuster.deletefolder($(this).closest(".cfolder"));
			}).
			on("click", ".cfolderreallydeletebutton", function(e){
				enmuster.reallydeletefolder($(this).closest(".cfolder"));
			}).
			on("click", ".cfoldercanceldeletebutton", function(e){
				enmuster.canceldeletefolder($(this).closest(".cfolder"));
			}).
			on("click", ".cexclusiondeletebutton", function(e){
				enmuster.deleteexclusion($(this).closest(".cexclusion"));
			}).
			on("click", ".cexclusionreallydeletebutton", function(e){
				enmuster.reallydeleteexclusion($(this).closest(".cexclusion"));
			}).
			on("click", ".cexclusioncanceldeletebutton", function(e){
				enmuster.canceldeleteexclusion($(this).closest(".cexclusion"));
			}).
			on("click", ".cexcludepatternsplain", function(e){
				enmuster.editexcludepatterns($(this).closest(".cfolder"));
			}).
			on("submit", ".cformexcludepatterns", function(e){
				e.preventDefault(); e.stopPropagation();
				$(this).find("input").blur();
				enmuster.changeexcludepatterns($(this).closest(".cfolder"));
			}).
			on("click", ".cupgradeplain", function(e){
				enmuster.editupgrade($(this).closest(".cfolder"));
			}).
			on("submit", ".cformupgrade", function(e){
				e.preventDefault(); e.stopPropagation();
				$(this).find("input").blur();
				enmuster.changeupgrade($(this).closest(".cfolder"));
			}).
			on("click", ".curldeletebutton", function(e){
				enmuster.deleteurl($(this).closest(".curl"));
			}).
			on("click", ".curlsyncbutton", function(e){
				enmuster.syncurl($(this).closest(".curl"));
			}).
			on("click", ".curlreallydeletebutton", function(e){
				enmuster.reallydeleteurl($(this).closest(".curl"));
			}).
			on("click", ".curlcanceldeletebutton", function(e){
				enmuster.canceldeleteurl($(this).closest(".curl"));
			}).
			on("click", ".curladd", function(e){
				enmuster.addurl($(this).closest(".cfolder"));
			}).
			on("click", ".curlnameplain", function(e){
				enmuster.editurl($(this).closest(".curl"));
			}).
			on("submit", ".cformurlname", function(e){
				e.preventDefault(); e.stopPropagation();
				$(this).find("input").blur();
				enmuster.changeurl($(this).closest(".curl"));
			}).
			on("click", ".cselfsignedbutton", function(e){
				enmuster.togglestrictssl($(this).closest(".curl"));
			}).
			on("click", ".ctunneldeletebutton", function(e){
				enmuster.deletetunnel($(this).closest(".curl"));
			}).
			on("click", ".ctunnelreallydeletebutton", function(e){
				enmuster.reallydeletetunnel($(this).closest(".curl"));
			}).
			on("click", ".ctunnelcanceldeletebutton", function(e){
				enmuster.canceldeletetunnel($(this).closest(".curl"));
			}).
			on("click", ".ctunneladdbutton", function(e){
				enmuster.addtunnel($(this).closest(".curl"));
			}).
			on("click", ".ctunnelnameplain", function(e){
				enmuster.edittunnel($(this).closest(".curl"));
			}).
			on("submit", ".cformtunnelcredentials", function(e){
				e.preventDefault(); e.stopPropagation();
				$(this).find("input").blur();
				enmuster.changetunnel($(this).closest(".curl"));
			}).on("click", ".cprojectdeploy", function(e) {
				enmuster.changeprojectdeploy();
			}).on("click", ".cfolderdeploy", function(e) {
				if ($(this).attr("enmusterdeploy") == "na") { return; }
				enmuster.changefolderdeploy($(this).closest(".cfolder"));
			}).on("click", ".curldeploy", function(e) {
				if ($(this).attr("enmusterdeploy") == "na") { return; }
				enmuster.changeurldeploy($(this).closest(".curl"));
			}).on("click", ".crevisiondeletebutton", function(e){
				enmuster.deleterevision($(this).closest(".cfolder"));
			}).
			on("click", ".crevisionreallydeletebutton", function(e){
				enmuster.reallydeleterevision($(this).closest(".cfolder"));
			}).
			on("click", ".crevisioncanceldeletebutton", function(e){
				enmuster.canceldeleterevision($(this).closest(".cfolder")); 
			}).on("click", ".cmaintenancedeletebutton", function(e){
				enmuster.deletemaintenance($(this).closest(".cfolder"));
			}).
			on("click", ".cmaintenancereallydeletebutton", function(e){
				enmuster.reallydeletemaintenance($(this).closest(".cfolder"));
			}).
			on("click", ".cmaintenancecanceldeletebutton", function(e){
				enmuster.canceldeletemaintenance($(this).closest(".cfolder")); 
			});
		
		/* handle drag and drop of new or replacement folder, exclusion, revision or maintenance file(s) */
		var setupfiledrop = function(ancestor, targets, onefile, fn){
			$(ancestor).on(
				{dragenter: function(e) {
					e.stopPropagation(); e.preventDefault();
					$(this).addClass("cdropover");
				 },
				 dragover: function(e) {
					 e.stopPropagation(); e.preventDefault();
				 },
				 dragleave: function(e) {
					 e.stopPropagation(); e.preventDefault();
					 $(this).removeClass("cdropover");
				 },
				 drop: function (e) {
					 var jel = $(this);
					 jel.removeClass("cdropover");
					 e.preventDefault();
					 var files = e.originalEvent.dataTransfer.files;
					 if (onefile && files.length != 1) {
						 enmuster.showerror("just one file please!");
						 return;
					 }		     
					 Nasync.map(files, 
								function(file, cb){
									Nfs.stat(file.path, function(err, stats) {
										if (err) { return cb(err); }
										cb(null, stats);
									});
								},
								function(err, astats){
									if (err) { enmuster.showerror("cannot lookup file"); }
									if (onefile && ! astats[0].isFile()) {
										enmuster.showerror("only drop a file here please (not a folder)!");
									}
									for (var i=0; i < files.length; i++) {
										fn(jel, files[i].path, astats[i]);
									}
								});
				 }},
				targets);
		};
		
		setupfiledrop("#icurrentproject", "#ifolderadd,.cfoldername", false, function(jel, path, stats){
			enmuster.dropfolder(path, stats, jel.hasClass("cfoldername") ? jel.closest(".cfolder") : null);
		});
		
		setupfiledrop("#ifolders", ".cexclusionadd,.cexclusionname", false, function(jel, path, stats){
			enmuster.dropexclusion(path, stats, jel.closest(".cfolder"), 
								   jel.hasClass("cexclusionname") ? jel.closest(".cexclusion") : null);
		});
		
		setupfiledrop("#icurrentproject", ".crevisionadd, .crevisionname", true, function(jel, path, stats){
			enmuster.droprevision(path, stats, jel.closest(".cfolder"));
		});
		
		setupfiledrop("#icurrentproject", ".cmaintenanceadd, .cmaintenancename", true, 
					  function(jel, path, stats){
						  enmuster.dropmaintenance(path, stats, jel.closest(".cfolder"));
					  });
		
		setupfiledrop("#iprojects", "#inewprojectbutton", true, 
					  function(jel, path, stats){ enmuster.importproject(path, stats); });
		
		/* prevent dropping onto document elsewhere blowing up by displaying file */
		$(document).
			on('dragenter', function(e) { e.stopPropagation(); e.preventDefault(); }).
			on('dragover', function (e) {
				e.stopPropagation();
				e.preventDefault();
				$("#ifolderadd").removeClass("cdropover");
			});
		$(document).on('drop', function(e) { e.stopPropagation(); e.preventDefault();  });
	
		var setusortable = function(target, fn){
			$(target).sortable({
				start: function(e, ui) { ui.item.prop("oldi", ui.item.index());	},
				update: function(e, ui){	   
					var oldi = ui.item.prop("oldi");
					var newi = ui.item.index();
					if (newi == oldi) { return; }
					fn(oldi, newi, ui.item);
					projects.save();
				}
			});
		};
		
		/* enamble sorting of projects, folders and urls */
		setusortable(".cprojects", function(oldi, newi, jel){
			projects.reorderProjects(oldi, newi);
		});
		setusortable(".cfolders", function(oldi, newi, jel){
			projects.currentProject().reorderFolders(oldi, newi);
		});
		setusortable(".curls", function(oldi, newi, jel){
			projects.getFolderOfCurrent(jel.closest(".cfolder").index()).reorderUrls(oldi, newi);
		});
		
		
		$("#ierrorbackground").click(function(e){ e.stopPropagation(); });
		$("#iinfobackground").click(function(e){ e.stopPropagation(); });
		
		this.redraw();
    }
	
} /* end enmuster */