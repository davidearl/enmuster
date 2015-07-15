/* These are the classes for the manifest which is supplied (as JSON) by the server; it applies useful
   methods to it. */

var ManifestItem = {
	isDirectory: function() { return false; },
	isFile: function() { return false; },
	isWritable: function() { return this.writable; },
	getname: function() { return this.name; },
	UtimeToMtime: function(utime) { return Math.floor(utime/1000); },
	MtimeToUtime: function(mtime) { return mtime*1000; },
};


var ManifestFolder = Object.create(ManifestItem);
ManifestFolder.Factory = function(o) { 
	var f = Object.create(ManifestFolder);
	f.name = o.name;
	f.writable = o.writable;
	f.mtime = o.mtime;
	f.folder = Manifest.Factory(o.folder);
	return f;
};
ManifestFolder.bald = function() {
	var o = {name: this.name, writable: this.writable, mtime: this.mtime, folder: this.folder.bald()};
	if (this.isdrop) { o.isdrop = this.isdrop; }
	if (this.isnew) { o.isnew = this.isnew; }
	return o;
};
ManifestFolder.isDirectory = function() { return true; };


var ManifestFile = Object.create(ManifestItem);
ManifestFile.Factory = function(o) {
	var f = Object.create(ManifestFile);
	f.name = o.name;
	f.writable = o.writable;
	f.size = o.size;
	f.mtime = o.mtime;
	if ("digest" in o) { f.digest = o.digest; }
	return f;
};
ManifestFile.bald = function() {
	var o = {name: this.name, writable: this.writable, size: this.size, mtime: this.mtime};
	if (this.digest) { o.digest = f.digest; }
	if (this.isdrop) { o.isdrop = this.isdrop; }
	if (this.isnew) { o.isnew = this.isnew; }
	if ("filenumber" in this) { o.filenumber = this.filenumber; }
	return o;
};
ManifestFile.isFile = function() { return true; };


var ManifestOther = Object.create(ManifestItem);
ManifestOther.Factory = function(o) { 
	var f = Object.create(ManifestOther);
	f.writable = false;
	f.name = o.name;
	return f;
};
ManifestOther.bald = function() {
	return {name: this.name, writable: false};
};


var Manifest = {
	/* manifest, from the server, looks like this: 
	   [ { name: 'leafname', date: timestamp, writable: true, size: bytes, digest: digest},
	   { name: 'leafname', date: timestamp, writable: true, folder: [...recursively...]},
	   { name: 'leafname', writable: true, link: 'target' },
	   { name: 'leafname', writable: true, unknown: true },
	   ... ]
	   - each level is itself a Manifest
	*/
	Factory: function(a) {
		var f = Object.create(Manifest);
		f.items = {};
		a.forEach(function(item){
			f.items[item.name] = 
				("folder" in item) ? ManifestFolder.Factory(item) : 
				(("size" in item) ? ManifestFile.Factory(item) :
				 ManifestOther.Factory(item));
		});
		return f;
	},

	bald: function(){		
		var a = [];
		this.each(function(item){ a.push(item.bald()); });
		return a;
	},

	json: function(){ return JSON.stringify(this.bald()); },

	length: function() { return this.items.length; },

	get: function(name) {
		return (name in this.items) ? this.items[name] : null;
	},

	add: function(item) {
		if (item.name in this.items) { throw new Error(item.name + " duplicated: already in manifest"); }
		this.items[item.name] = item;
	},

	names: function() {
		 /* so that we get a consistent, predictable order. However, Object.keys doesn't seem to exist? */
		// return this.items.keys().sort();
		var names = [];
		for (var name in this.items) { names.push(name); };
		return names.sort();		
	},

	each: function(fn) {
		var self = this;
		self.names().forEach(function(name){ fn(self.items[name]); });
	},

	removeIfPresent: function(name) {
		if (! (name in this.items)) { return; }
		delete this.items[name];
	},
};
