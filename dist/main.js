#!/usr/bin/env node
import{createRequire}from'node:module';const require=createRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// node_modules/readdirp/esm/index.js
import { stat, lstat, readdir, realpath } from "node:fs/promises";
import { Readable } from "node:stream";
import { resolve as presolve, relative as prelative, join as pjoin, sep as psep } from "node:path";
function readdirp(root, options = {}) {
  let type = options.entryType || options.type;
  if (type === "both")
    type = EntryTypes.FILE_DIR_TYPE;
  if (type)
    options.type = type;
  if (!root) {
    throw new Error("readdirp: root argument is required. Usage: readdirp(root, options)");
  } else if (typeof root !== "string") {
    throw new TypeError("readdirp: root argument must be a string. Usage: readdirp(root, options)");
  } else if (type && !ALL_TYPES.includes(type)) {
    throw new Error(`readdirp: Invalid type passed. Use one of ${ALL_TYPES.join(", ")}`);
  }
  options.root = root;
  return new ReaddirpStream(options);
}
var EntryTypes, defaultOptions2, RECURSIVE_ERROR_CODE, NORMAL_FLOW_ERRORS, ALL_TYPES, DIR_TYPES, FILE_TYPES, isNormalFlowError, wantBigintFsStats, emptyFn, normalizeFilter, ReaddirpStream;
var init_esm = __esm({
  "node_modules/readdirp/esm/index.js"() {
    EntryTypes = {
      FILE_TYPE: "files",
      DIR_TYPE: "directories",
      FILE_DIR_TYPE: "files_directories",
      EVERYTHING_TYPE: "all"
    };
    defaultOptions2 = {
      root: ".",
      fileFilter: (_entryInfo) => true,
      directoryFilter: (_entryInfo) => true,
      type: EntryTypes.FILE_TYPE,
      lstat: false,
      depth: 2147483648,
      alwaysStat: false,
      highWaterMark: 4096
    };
    Object.freeze(defaultOptions2);
    RECURSIVE_ERROR_CODE = "READDIRP_RECURSIVE_ERROR";
    NORMAL_FLOW_ERRORS = /* @__PURE__ */ new Set(["ENOENT", "EPERM", "EACCES", "ELOOP", RECURSIVE_ERROR_CODE]);
    ALL_TYPES = [
      EntryTypes.DIR_TYPE,
      EntryTypes.EVERYTHING_TYPE,
      EntryTypes.FILE_DIR_TYPE,
      EntryTypes.FILE_TYPE
    ];
    DIR_TYPES = /* @__PURE__ */ new Set([
      EntryTypes.DIR_TYPE,
      EntryTypes.EVERYTHING_TYPE,
      EntryTypes.FILE_DIR_TYPE
    ]);
    FILE_TYPES = /* @__PURE__ */ new Set([
      EntryTypes.EVERYTHING_TYPE,
      EntryTypes.FILE_DIR_TYPE,
      EntryTypes.FILE_TYPE
    ]);
    isNormalFlowError = (error) => NORMAL_FLOW_ERRORS.has(error.code);
    wantBigintFsStats = process.platform === "win32";
    emptyFn = (_entryInfo) => true;
    normalizeFilter = (filter) => {
      if (filter === void 0)
        return emptyFn;
      if (typeof filter === "function")
        return filter;
      if (typeof filter === "string") {
        const fl = filter.trim();
        return (entry) => entry.basename === fl;
      }
      if (Array.isArray(filter)) {
        const trItems = filter.map((item) => item.trim());
        return (entry) => trItems.some((f) => entry.basename === f);
      }
      return emptyFn;
    };
    ReaddirpStream = class extends Readable {
      constructor(options = {}) {
        super({
          objectMode: true,
          autoDestroy: true,
          highWaterMark: options.highWaterMark
        });
        const opts = { ...defaultOptions2, ...options };
        const { root, type } = opts;
        this._fileFilter = normalizeFilter(opts.fileFilter);
        this._directoryFilter = normalizeFilter(opts.directoryFilter);
        const statMethod = opts.lstat ? lstat : stat;
        if (wantBigintFsStats) {
          this._stat = (path3) => statMethod(path3, { bigint: true });
        } else {
          this._stat = statMethod;
        }
        this._maxDepth = opts.depth ?? defaultOptions2.depth;
        this._wantsDir = type ? DIR_TYPES.has(type) : false;
        this._wantsFile = type ? FILE_TYPES.has(type) : false;
        this._wantsEverything = type === EntryTypes.EVERYTHING_TYPE;
        this._root = presolve(root);
        this._isDirent = !opts.alwaysStat;
        this._statsProp = this._isDirent ? "dirent" : "stats";
        this._rdOptions = { encoding: "utf8", withFileTypes: this._isDirent };
        this.parents = [this._exploreDir(root, 1)];
        this.reading = false;
        this.parent = void 0;
      }
      async _read(batch) {
        if (this.reading)
          return;
        this.reading = true;
        try {
          while (!this.destroyed && batch > 0) {
            const par = this.parent;
            const fil = par && par.files;
            if (fil && fil.length > 0) {
              const { path: path3, depth } = par;
              const slice = fil.splice(0, batch).map((dirent) => this._formatEntry(dirent, path3));
              const awaited = await Promise.all(slice);
              for (const entry of awaited) {
                if (!entry)
                  continue;
                if (this.destroyed)
                  return;
                const entryType = await this._getEntryType(entry);
                if (entryType === "directory" && this._directoryFilter(entry)) {
                  if (depth <= this._maxDepth) {
                    this.parents.push(this._exploreDir(entry.fullPath, depth + 1));
                  }
                  if (this._wantsDir) {
                    this.push(entry);
                    batch--;
                  }
                } else if ((entryType === "file" || this._includeAsFile(entry)) && this._fileFilter(entry)) {
                  if (this._wantsFile) {
                    this.push(entry);
                    batch--;
                  }
                }
              }
            } else {
              const parent = this.parents.pop();
              if (!parent) {
                this.push(null);
                break;
              }
              this.parent = await parent;
              if (this.destroyed)
                return;
            }
          }
        } catch (error) {
          this.destroy(error);
        } finally {
          this.reading = false;
        }
      }
      async _exploreDir(path3, depth) {
        let files;
        try {
          files = await readdir(path3, this._rdOptions);
        } catch (error) {
          this._onError(error);
        }
        return { files, depth, path: path3 };
      }
      async _formatEntry(dirent, path3) {
        let entry;
        const basename3 = this._isDirent ? dirent.name : dirent;
        try {
          const fullPath = presolve(pjoin(path3, basename3));
          entry = { path: prelative(this._root, fullPath), fullPath, basename: basename3 };
          entry[this._statsProp] = this._isDirent ? dirent : await this._stat(fullPath);
        } catch (err) {
          this._onError(err);
          return;
        }
        return entry;
      }
      _onError(err) {
        if (isNormalFlowError(err) && !this.destroyed) {
          this.emit("warn", err);
        } else {
          this.destroy(err);
        }
      }
      async _getEntryType(entry) {
        if (!entry && this._statsProp in entry) {
          return "";
        }
        const stats = entry[this._statsProp];
        if (stats.isFile())
          return "file";
        if (stats.isDirectory())
          return "directory";
        if (stats && stats.isSymbolicLink()) {
          const full = entry.fullPath;
          try {
            const entryRealPath = await realpath(full);
            const entryRealPathStats = await lstat(entryRealPath);
            if (entryRealPathStats.isFile()) {
              return "file";
            }
            if (entryRealPathStats.isDirectory()) {
              const len = entryRealPath.length;
              if (full.startsWith(entryRealPath) && full.substr(len, 1) === psep) {
                const recursiveError = new Error(`Circular symlink detected: "${full}" points to "${entryRealPath}"`);
                recursiveError.code = RECURSIVE_ERROR_CODE;
                return this._onError(recursiveError);
              }
              return "directory";
            }
          } catch (error) {
            this._onError(error);
            return "";
          }
        }
      }
      _includeAsFile(entry) {
        const stats = entry && entry[this._statsProp];
        return stats && this._wantsEverything && !stats.isDirectory();
      }
    };
  }
});

// node_modules/chokidar/esm/handler.js
import { watchFile, unwatchFile, watch as fs_watch } from "fs";
import { open, stat as stat2, lstat as lstat2, realpath as fsrealpath } from "fs/promises";
import * as sysPath from "path";
import { type as osType } from "os";
function createFsWatchInstance(path3, options, listener, errHandler, emitRaw) {
  const handleEvent = (rawEvent, evPath) => {
    listener(path3);
    emitRaw(rawEvent, evPath, { watchedPath: path3 });
    if (evPath && path3 !== evPath) {
      fsWatchBroadcast(sysPath.resolve(path3, evPath), KEY_LISTENERS, sysPath.join(path3, evPath));
    }
  };
  try {
    return fs_watch(path3, {
      persistent: options.persistent
    }, handleEvent);
  } catch (error) {
    errHandler(error);
    return void 0;
  }
}
var STR_DATA, STR_END, STR_CLOSE, EMPTY_FN, pl, isWindows, isMacos, isLinux, isFreeBSD, isIBMi, EVENTS, EV, THROTTLE_MODE_WATCH, statMethods, KEY_LISTENERS, KEY_ERR, KEY_RAW, HANDLER_KEYS, binaryExtensions, isBinaryPath, foreach, addAndConvert, clearItem, delFromSet, isEmptySet, FsWatchInstances, fsWatchBroadcast, setFsWatchListener, FsWatchFileInstances, setFsWatchFileListener, NodeFsHandler;
var init_handler = __esm({
  "node_modules/chokidar/esm/handler.js"() {
    STR_DATA = "data";
    STR_END = "end";
    STR_CLOSE = "close";
    EMPTY_FN = () => {
    };
    pl = process.platform;
    isWindows = pl === "win32";
    isMacos = pl === "darwin";
    isLinux = pl === "linux";
    isFreeBSD = pl === "freebsd";
    isIBMi = osType() === "OS400";
    EVENTS = {
      ALL: "all",
      READY: "ready",
      ADD: "add",
      CHANGE: "change",
      ADD_DIR: "addDir",
      UNLINK: "unlink",
      UNLINK_DIR: "unlinkDir",
      RAW: "raw",
      ERROR: "error"
    };
    EV = EVENTS;
    THROTTLE_MODE_WATCH = "watch";
    statMethods = { lstat: lstat2, stat: stat2 };
    KEY_LISTENERS = "listeners";
    KEY_ERR = "errHandlers";
    KEY_RAW = "rawEmitters";
    HANDLER_KEYS = [KEY_LISTENERS, KEY_ERR, KEY_RAW];
    binaryExtensions = /* @__PURE__ */ new Set([
      "3dm",
      "3ds",
      "3g2",
      "3gp",
      "7z",
      "a",
      "aac",
      "adp",
      "afdesign",
      "afphoto",
      "afpub",
      "ai",
      "aif",
      "aiff",
      "alz",
      "ape",
      "apk",
      "appimage",
      "ar",
      "arj",
      "asf",
      "au",
      "avi",
      "bak",
      "baml",
      "bh",
      "bin",
      "bk",
      "bmp",
      "btif",
      "bz2",
      "bzip2",
      "cab",
      "caf",
      "cgm",
      "class",
      "cmx",
      "cpio",
      "cr2",
      "cur",
      "dat",
      "dcm",
      "deb",
      "dex",
      "djvu",
      "dll",
      "dmg",
      "dng",
      "doc",
      "docm",
      "docx",
      "dot",
      "dotm",
      "dra",
      "DS_Store",
      "dsk",
      "dts",
      "dtshd",
      "dvb",
      "dwg",
      "dxf",
      "ecelp4800",
      "ecelp7470",
      "ecelp9600",
      "egg",
      "eol",
      "eot",
      "epub",
      "exe",
      "f4v",
      "fbs",
      "fh",
      "fla",
      "flac",
      "flatpak",
      "fli",
      "flv",
      "fpx",
      "fst",
      "fvt",
      "g3",
      "gh",
      "gif",
      "graffle",
      "gz",
      "gzip",
      "h261",
      "h263",
      "h264",
      "icns",
      "ico",
      "ief",
      "img",
      "ipa",
      "iso",
      "jar",
      "jpeg",
      "jpg",
      "jpgv",
      "jpm",
      "jxr",
      "key",
      "ktx",
      "lha",
      "lib",
      "lvp",
      "lz",
      "lzh",
      "lzma",
      "lzo",
      "m3u",
      "m4a",
      "m4v",
      "mar",
      "mdi",
      "mht",
      "mid",
      "midi",
      "mj2",
      "mka",
      "mkv",
      "mmr",
      "mng",
      "mobi",
      "mov",
      "movie",
      "mp3",
      "mp4",
      "mp4a",
      "mpeg",
      "mpg",
      "mpga",
      "mxu",
      "nef",
      "npx",
      "numbers",
      "nupkg",
      "o",
      "odp",
      "ods",
      "odt",
      "oga",
      "ogg",
      "ogv",
      "otf",
      "ott",
      "pages",
      "pbm",
      "pcx",
      "pdb",
      "pdf",
      "pea",
      "pgm",
      "pic",
      "png",
      "pnm",
      "pot",
      "potm",
      "potx",
      "ppa",
      "ppam",
      "ppm",
      "pps",
      "ppsm",
      "ppsx",
      "ppt",
      "pptm",
      "pptx",
      "psd",
      "pya",
      "pyc",
      "pyo",
      "pyv",
      "qt",
      "rar",
      "ras",
      "raw",
      "resources",
      "rgb",
      "rip",
      "rlc",
      "rmf",
      "rmvb",
      "rpm",
      "rtf",
      "rz",
      "s3m",
      "s7z",
      "scpt",
      "sgi",
      "shar",
      "snap",
      "sil",
      "sketch",
      "slk",
      "smv",
      "snk",
      "so",
      "stl",
      "suo",
      "sub",
      "swf",
      "tar",
      "tbz",
      "tbz2",
      "tga",
      "tgz",
      "thmx",
      "tif",
      "tiff",
      "tlz",
      "ttc",
      "ttf",
      "txz",
      "udf",
      "uvh",
      "uvi",
      "uvm",
      "uvp",
      "uvs",
      "uvu",
      "viv",
      "vob",
      "war",
      "wav",
      "wax",
      "wbmp",
      "wdp",
      "weba",
      "webm",
      "webp",
      "whl",
      "wim",
      "wm",
      "wma",
      "wmv",
      "wmx",
      "woff",
      "woff2",
      "wrm",
      "wvx",
      "xbm",
      "xif",
      "xla",
      "xlam",
      "xls",
      "xlsb",
      "xlsm",
      "xlsx",
      "xlt",
      "xltm",
      "xltx",
      "xm",
      "xmind",
      "xpi",
      "xpm",
      "xwd",
      "xz",
      "z",
      "zip",
      "zipx"
    ]);
    isBinaryPath = (filePath) => binaryExtensions.has(sysPath.extname(filePath).slice(1).toLowerCase());
    foreach = (val, fn) => {
      if (val instanceof Set) {
        val.forEach(fn);
      } else {
        fn(val);
      }
    };
    addAndConvert = (main2, prop, item) => {
      let container = main2[prop];
      if (!(container instanceof Set)) {
        main2[prop] = container = /* @__PURE__ */ new Set([container]);
      }
      container.add(item);
    };
    clearItem = (cont) => (key) => {
      const set = cont[key];
      if (set instanceof Set) {
        set.clear();
      } else {
        delete cont[key];
      }
    };
    delFromSet = (main2, prop, item) => {
      const container = main2[prop];
      if (container instanceof Set) {
        container.delete(item);
      } else if (container === item) {
        delete main2[prop];
      }
    };
    isEmptySet = (val) => val instanceof Set ? val.size === 0 : !val;
    FsWatchInstances = /* @__PURE__ */ new Map();
    fsWatchBroadcast = (fullPath, listenerType, val1, val2, val3) => {
      const cont = FsWatchInstances.get(fullPath);
      if (!cont)
        return;
      foreach(cont[listenerType], (listener) => {
        listener(val1, val2, val3);
      });
    };
    setFsWatchListener = (path3, fullPath, options, handlers) => {
      const { listener, errHandler, rawEmitter } = handlers;
      let cont = FsWatchInstances.get(fullPath);
      let watcher;
      if (!options.persistent) {
        watcher = createFsWatchInstance(path3, options, listener, errHandler, rawEmitter);
        if (!watcher)
          return;
        return watcher.close.bind(watcher);
      }
      if (cont) {
        addAndConvert(cont, KEY_LISTENERS, listener);
        addAndConvert(cont, KEY_ERR, errHandler);
        addAndConvert(cont, KEY_RAW, rawEmitter);
      } else {
        watcher = createFsWatchInstance(
          path3,
          options,
          fsWatchBroadcast.bind(null, fullPath, KEY_LISTENERS),
          errHandler,
          // no need to use broadcast here
          fsWatchBroadcast.bind(null, fullPath, KEY_RAW)
        );
        if (!watcher)
          return;
        watcher.on(EV.ERROR, async (error) => {
          const broadcastErr = fsWatchBroadcast.bind(null, fullPath, KEY_ERR);
          if (cont)
            cont.watcherUnusable = true;
          if (isWindows && error.code === "EPERM") {
            try {
              const fd = await open(path3, "r");
              await fd.close();
              broadcastErr(error);
            } catch (err) {
            }
          } else {
            broadcastErr(error);
          }
        });
        cont = {
          listeners: listener,
          errHandlers: errHandler,
          rawEmitters: rawEmitter,
          watcher
        };
        FsWatchInstances.set(fullPath, cont);
      }
      return () => {
        delFromSet(cont, KEY_LISTENERS, listener);
        delFromSet(cont, KEY_ERR, errHandler);
        delFromSet(cont, KEY_RAW, rawEmitter);
        if (isEmptySet(cont.listeners)) {
          cont.watcher.close();
          FsWatchInstances.delete(fullPath);
          HANDLER_KEYS.forEach(clearItem(cont));
          cont.watcher = void 0;
          Object.freeze(cont);
        }
      };
    };
    FsWatchFileInstances = /* @__PURE__ */ new Map();
    setFsWatchFileListener = (path3, fullPath, options, handlers) => {
      const { listener, rawEmitter } = handlers;
      let cont = FsWatchFileInstances.get(fullPath);
      const copts = cont && cont.options;
      if (copts && (copts.persistent < options.persistent || copts.interval > options.interval)) {
        unwatchFile(fullPath);
        cont = void 0;
      }
      if (cont) {
        addAndConvert(cont, KEY_LISTENERS, listener);
        addAndConvert(cont, KEY_RAW, rawEmitter);
      } else {
        cont = {
          listeners: listener,
          rawEmitters: rawEmitter,
          options,
          watcher: watchFile(fullPath, options, (curr, prev) => {
            foreach(cont.rawEmitters, (rawEmitter2) => {
              rawEmitter2(EV.CHANGE, fullPath, { curr, prev });
            });
            const currmtime = curr.mtimeMs;
            if (curr.size !== prev.size || currmtime > prev.mtimeMs || currmtime === 0) {
              foreach(cont.listeners, (listener2) => listener2(path3, curr));
            }
          })
        };
        FsWatchFileInstances.set(fullPath, cont);
      }
      return () => {
        delFromSet(cont, KEY_LISTENERS, listener);
        delFromSet(cont, KEY_RAW, rawEmitter);
        if (isEmptySet(cont.listeners)) {
          FsWatchFileInstances.delete(fullPath);
          unwatchFile(fullPath);
          cont.options = cont.watcher = void 0;
          Object.freeze(cont);
        }
      };
    };
    NodeFsHandler = class {
      constructor(fsW) {
        this.fsw = fsW;
        this._boundHandleError = (error) => fsW._handleError(error);
      }
      /**
       * Watch file for changes with fs_watchFile or fs_watch.
       * @param path to file or dir
       * @param listener on fs change
       * @returns closer for the watcher instance
       */
      _watchWithNodeFs(path3, listener) {
        const opts = this.fsw.options;
        const directory = sysPath.dirname(path3);
        const basename3 = sysPath.basename(path3);
        const parent = this.fsw._getWatchedDir(directory);
        parent.add(basename3);
        const absolutePath = sysPath.resolve(path3);
        const options = {
          persistent: opts.persistent
        };
        if (!listener)
          listener = EMPTY_FN;
        let closer;
        if (opts.usePolling) {
          const enableBin = opts.interval !== opts.binaryInterval;
          options.interval = enableBin && isBinaryPath(basename3) ? opts.binaryInterval : opts.interval;
          closer = setFsWatchFileListener(path3, absolutePath, options, {
            listener,
            rawEmitter: this.fsw._emitRaw
          });
        } else {
          closer = setFsWatchListener(path3, absolutePath, options, {
            listener,
            errHandler: this._boundHandleError,
            rawEmitter: this.fsw._emitRaw
          });
        }
        return closer;
      }
      /**
       * Watch a file and emit add event if warranted.
       * @returns closer for the watcher instance
       */
      _handleFile(file, stats, initialAdd) {
        if (this.fsw.closed) {
          return;
        }
        const dirname3 = sysPath.dirname(file);
        const basename3 = sysPath.basename(file);
        const parent = this.fsw._getWatchedDir(dirname3);
        let prevStats = stats;
        if (parent.has(basename3))
          return;
        const listener = async (path3, newStats) => {
          if (!this.fsw._throttle(THROTTLE_MODE_WATCH, file, 5))
            return;
          if (!newStats || newStats.mtimeMs === 0) {
            try {
              const newStats2 = await stat2(file);
              if (this.fsw.closed)
                return;
              const at2 = newStats2.atimeMs;
              const mt = newStats2.mtimeMs;
              if (!at2 || at2 <= mt || mt !== prevStats.mtimeMs) {
                this.fsw._emit(EV.CHANGE, file, newStats2);
              }
              if ((isMacos || isLinux || isFreeBSD) && prevStats.ino !== newStats2.ino) {
                this.fsw._closeFile(path3);
                prevStats = newStats2;
                const closer2 = this._watchWithNodeFs(file, listener);
                if (closer2)
                  this.fsw._addPathCloser(path3, closer2);
              } else {
                prevStats = newStats2;
              }
            } catch (error) {
              this.fsw._remove(dirname3, basename3);
            }
          } else if (parent.has(basename3)) {
            const at2 = newStats.atimeMs;
            const mt = newStats.mtimeMs;
            if (!at2 || at2 <= mt || mt !== prevStats.mtimeMs) {
              this.fsw._emit(EV.CHANGE, file, newStats);
            }
            prevStats = newStats;
          }
        };
        const closer = this._watchWithNodeFs(file, listener);
        if (!(initialAdd && this.fsw.options.ignoreInitial) && this.fsw._isntIgnored(file)) {
          if (!this.fsw._throttle(EV.ADD, file, 0))
            return;
          this.fsw._emit(EV.ADD, file, stats);
        }
        return closer;
      }
      /**
       * Handle symlinks encountered while reading a dir.
       * @param entry returned by readdirp
       * @param directory path of dir being read
       * @param path of this item
       * @param item basename of this item
       * @returns true if no more processing is needed for this entry.
       */
      async _handleSymlink(entry, directory, path3, item) {
        if (this.fsw.closed) {
          return;
        }
        const full = entry.fullPath;
        const dir = this.fsw._getWatchedDir(directory);
        if (!this.fsw.options.followSymlinks) {
          this.fsw._incrReadyCount();
          let linkPath;
          try {
            linkPath = await fsrealpath(path3);
          } catch (e) {
            this.fsw._emitReady();
            return true;
          }
          if (this.fsw.closed)
            return;
          if (dir.has(item)) {
            if (this.fsw._symlinkPaths.get(full) !== linkPath) {
              this.fsw._symlinkPaths.set(full, linkPath);
              this.fsw._emit(EV.CHANGE, path3, entry.stats);
            }
          } else {
            dir.add(item);
            this.fsw._symlinkPaths.set(full, linkPath);
            this.fsw._emit(EV.ADD, path3, entry.stats);
          }
          this.fsw._emitReady();
          return true;
        }
        if (this.fsw._symlinkPaths.has(full)) {
          return true;
        }
        this.fsw._symlinkPaths.set(full, true);
      }
      _handleRead(directory, initialAdd, wh, target, dir, depth, throttler) {
        directory = sysPath.join(directory, "");
        throttler = this.fsw._throttle("readdir", directory, 1e3);
        if (!throttler)
          return;
        const previous = this.fsw._getWatchedDir(wh.path);
        const current2 = /* @__PURE__ */ new Set();
        let stream = this.fsw._readdirp(directory, {
          fileFilter: (entry) => wh.filterPath(entry),
          directoryFilter: (entry) => wh.filterDir(entry)
        });
        if (!stream)
          return;
        stream.on(STR_DATA, async (entry) => {
          if (this.fsw.closed) {
            stream = void 0;
            return;
          }
          const item = entry.path;
          let path3 = sysPath.join(directory, item);
          current2.add(item);
          if (entry.stats.isSymbolicLink() && await this._handleSymlink(entry, directory, path3, item)) {
            return;
          }
          if (this.fsw.closed) {
            stream = void 0;
            return;
          }
          if (item === target || !target && !previous.has(item)) {
            this.fsw._incrReadyCount();
            path3 = sysPath.join(dir, sysPath.relative(dir, path3));
            this._addToNodeFs(path3, initialAdd, wh, depth + 1);
          }
        }).on(EV.ERROR, this._boundHandleError);
        return new Promise((resolve3, reject) => {
          if (!stream)
            return reject();
          stream.once(STR_END, () => {
            if (this.fsw.closed) {
              stream = void 0;
              return;
            }
            const wasThrottled = throttler ? throttler.clear() : false;
            resolve3(void 0);
            previous.getChildren().filter((item) => {
              return item !== directory && !current2.has(item);
            }).forEach((item) => {
              this.fsw._remove(directory, item);
            });
            stream = void 0;
            if (wasThrottled)
              this._handleRead(directory, false, wh, target, dir, depth, throttler);
          });
        });
      }
      /**
       * Read directory to add / remove files from `@watched` list and re-read it on change.
       * @param dir fs path
       * @param stats
       * @param initialAdd
       * @param depth relative to user-supplied path
       * @param target child path targeted for watch
       * @param wh Common watch helpers for this path
       * @param realpath
       * @returns closer for the watcher instance.
       */
      async _handleDir(dir, stats, initialAdd, depth, target, wh, realpath2) {
        const parentDir = this.fsw._getWatchedDir(sysPath.dirname(dir));
        const tracked = parentDir.has(sysPath.basename(dir));
        if (!(initialAdd && this.fsw.options.ignoreInitial) && !target && !tracked) {
          this.fsw._emit(EV.ADD_DIR, dir, stats);
        }
        parentDir.add(sysPath.basename(dir));
        this.fsw._getWatchedDir(dir);
        let throttler;
        let closer;
        const oDepth = this.fsw.options.depth;
        if ((oDepth == null || depth <= oDepth) && !this.fsw._symlinkPaths.has(realpath2)) {
          if (!target) {
            await this._handleRead(dir, initialAdd, wh, target, dir, depth, throttler);
            if (this.fsw.closed)
              return;
          }
          closer = this._watchWithNodeFs(dir, (dirPath, stats2) => {
            if (stats2 && stats2.mtimeMs === 0)
              return;
            this._handleRead(dirPath, false, wh, target, dir, depth, throttler);
          });
        }
        return closer;
      }
      /**
       * Handle added file, directory, or glob pattern.
       * Delegates call to _handleFile / _handleDir after checks.
       * @param path to file or ir
       * @param initialAdd was the file added at watch instantiation?
       * @param priorWh depth relative to user-supplied path
       * @param depth Child path actually targeted for watch
       * @param target Child path actually targeted for watch
       */
      async _addToNodeFs(path3, initialAdd, priorWh, depth, target) {
        const ready = this.fsw._emitReady;
        if (this.fsw._isIgnored(path3) || this.fsw.closed) {
          ready();
          return false;
        }
        const wh = this.fsw._getWatchHelpers(path3);
        if (priorWh) {
          wh.filterPath = (entry) => priorWh.filterPath(entry);
          wh.filterDir = (entry) => priorWh.filterDir(entry);
        }
        try {
          const stats = await statMethods[wh.statMethod](wh.watchPath);
          if (this.fsw.closed)
            return;
          if (this.fsw._isIgnored(wh.watchPath, stats)) {
            ready();
            return false;
          }
          const follow = this.fsw.options.followSymlinks;
          let closer;
          if (stats.isDirectory()) {
            const absPath = sysPath.resolve(path3);
            const targetPath = follow ? await fsrealpath(path3) : path3;
            if (this.fsw.closed)
              return;
            closer = await this._handleDir(wh.watchPath, stats, initialAdd, depth, target, wh, targetPath);
            if (this.fsw.closed)
              return;
            if (absPath !== targetPath && targetPath !== void 0) {
              this.fsw._symlinkPaths.set(absPath, targetPath);
            }
          } else if (stats.isSymbolicLink()) {
            const targetPath = follow ? await fsrealpath(path3) : path3;
            if (this.fsw.closed)
              return;
            const parent = sysPath.dirname(wh.watchPath);
            this.fsw._getWatchedDir(parent).add(wh.watchPath);
            this.fsw._emit(EV.ADD, wh.watchPath, stats);
            closer = await this._handleDir(parent, stats, initialAdd, depth, path3, wh, targetPath);
            if (this.fsw.closed)
              return;
            if (targetPath !== void 0) {
              this.fsw._symlinkPaths.set(sysPath.resolve(path3), targetPath);
            }
          } else {
            closer = this._handleFile(wh.watchPath, stats, initialAdd);
          }
          ready();
          if (closer)
            this.fsw._addPathCloser(path3, closer);
          return false;
        } catch (error) {
          if (this.fsw._handleError(error)) {
            ready();
            return path3;
          }
        }
      }
    };
  }
});

// node_modules/chokidar/esm/index.js
var esm_exports = {};
__export(esm_exports, {
  FSWatcher: () => FSWatcher,
  WatchHelper: () => WatchHelper,
  default: () => esm_default,
  watch: () => watch
});
import { stat as statcb } from "fs";
import { stat as stat3, readdir as readdir2 } from "fs/promises";
import { EventEmitter } from "events";
import * as sysPath2 from "path";
function arrify(item) {
  return Array.isArray(item) ? item : [item];
}
function createPattern(matcher) {
  if (typeof matcher === "function")
    return matcher;
  if (typeof matcher === "string")
    return (string) => matcher === string;
  if (matcher instanceof RegExp)
    return (string) => matcher.test(string);
  if (typeof matcher === "object" && matcher !== null) {
    return (string) => {
      if (matcher.path === string)
        return true;
      if (matcher.recursive) {
        const relative3 = sysPath2.relative(matcher.path, string);
        if (!relative3) {
          return false;
        }
        return !relative3.startsWith("..") && !sysPath2.isAbsolute(relative3);
      }
      return false;
    };
  }
  return () => false;
}
function normalizePath(path3) {
  if (typeof path3 !== "string")
    throw new Error("string expected");
  path3 = sysPath2.normalize(path3);
  path3 = path3.replace(/\\/g, "/");
  let prepend = false;
  if (path3.startsWith("//"))
    prepend = true;
  const DOUBLE_SLASH_RE2 = /\/\//;
  while (path3.match(DOUBLE_SLASH_RE2))
    path3 = path3.replace(DOUBLE_SLASH_RE2, "/");
  if (prepend)
    path3 = "/" + path3;
  return path3;
}
function matchPatterns(patterns, testString, stats) {
  const path3 = normalizePath(testString);
  for (let index = 0; index < patterns.length; index++) {
    const pattern = patterns[index];
    if (pattern(path3, stats)) {
      return true;
    }
  }
  return false;
}
function anymatch(matchers, testString) {
  if (matchers == null) {
    throw new TypeError("anymatch: specify first argument");
  }
  const matchersArray = arrify(matchers);
  const patterns = matchersArray.map((matcher) => createPattern(matcher));
  if (testString == null) {
    return (testString2, stats) => {
      return matchPatterns(patterns, testString2, stats);
    };
  }
  return matchPatterns(patterns, testString);
}
function watch(paths, options = {}) {
  const watcher = new FSWatcher(options);
  watcher.add(paths);
  return watcher;
}
var SLASH, SLASH_SLASH, ONE_DOT, TWO_DOTS, STRING_TYPE, BACK_SLASH_RE, DOUBLE_SLASH_RE, DOT_RE, REPLACER_RE, isMatcherObject, unifyPaths, toUnix, normalizePathToUnix, normalizeIgnored, getAbsolutePath, EMPTY_SET, DirEntry, STAT_METHOD_F, STAT_METHOD_L, WatchHelper, FSWatcher, esm_default;
var init_esm2 = __esm({
  "node_modules/chokidar/esm/index.js"() {
    init_esm();
    init_handler();
    SLASH = "/";
    SLASH_SLASH = "//";
    ONE_DOT = ".";
    TWO_DOTS = "..";
    STRING_TYPE = "string";
    BACK_SLASH_RE = /\\/g;
    DOUBLE_SLASH_RE = /\/\//;
    DOT_RE = /\..*\.(sw[px])$|~$|\.subl.*\.tmp/;
    REPLACER_RE = /^\.[/\\]/;
    isMatcherObject = (matcher) => typeof matcher === "object" && matcher !== null && !(matcher instanceof RegExp);
    unifyPaths = (paths_) => {
      const paths = arrify(paths_).flat();
      if (!paths.every((p) => typeof p === STRING_TYPE)) {
        throw new TypeError(`Non-string provided as watch path: ${paths}`);
      }
      return paths.map(normalizePathToUnix);
    };
    toUnix = (string) => {
      let str = string.replace(BACK_SLASH_RE, SLASH);
      let prepend = false;
      if (str.startsWith(SLASH_SLASH)) {
        prepend = true;
      }
      while (str.match(DOUBLE_SLASH_RE)) {
        str = str.replace(DOUBLE_SLASH_RE, SLASH);
      }
      if (prepend) {
        str = SLASH + str;
      }
      return str;
    };
    normalizePathToUnix = (path3) => toUnix(sysPath2.normalize(toUnix(path3)));
    normalizeIgnored = (cwd = "") => (path3) => {
      if (typeof path3 === "string") {
        return normalizePathToUnix(sysPath2.isAbsolute(path3) ? path3 : sysPath2.join(cwd, path3));
      } else {
        return path3;
      }
    };
    getAbsolutePath = (path3, cwd) => {
      if (sysPath2.isAbsolute(path3)) {
        return path3;
      }
      return sysPath2.join(cwd, path3);
    };
    EMPTY_SET = Object.freeze(/* @__PURE__ */ new Set());
    DirEntry = class {
      constructor(dir, removeWatcher) {
        this.path = dir;
        this._removeWatcher = removeWatcher;
        this.items = /* @__PURE__ */ new Set();
      }
      add(item) {
        const { items } = this;
        if (!items)
          return;
        if (item !== ONE_DOT && item !== TWO_DOTS)
          items.add(item);
      }
      async remove(item) {
        const { items } = this;
        if (!items)
          return;
        items.delete(item);
        if (items.size > 0)
          return;
        const dir = this.path;
        try {
          await readdir2(dir);
        } catch (err) {
          if (this._removeWatcher) {
            this._removeWatcher(sysPath2.dirname(dir), sysPath2.basename(dir));
          }
        }
      }
      has(item) {
        const { items } = this;
        if (!items)
          return;
        return items.has(item);
      }
      getChildren() {
        const { items } = this;
        if (!items)
          return [];
        return [...items.values()];
      }
      dispose() {
        this.items.clear();
        this.path = "";
        this._removeWatcher = EMPTY_FN;
        this.items = EMPTY_SET;
        Object.freeze(this);
      }
    };
    STAT_METHOD_F = "stat";
    STAT_METHOD_L = "lstat";
    WatchHelper = class {
      constructor(path3, follow, fsw) {
        this.fsw = fsw;
        const watchPath = path3;
        this.path = path3 = path3.replace(REPLACER_RE, "");
        this.watchPath = watchPath;
        this.fullWatchPath = sysPath2.resolve(watchPath);
        this.dirParts = [];
        this.dirParts.forEach((parts) => {
          if (parts.length > 1)
            parts.pop();
        });
        this.followSymlinks = follow;
        this.statMethod = follow ? STAT_METHOD_F : STAT_METHOD_L;
      }
      entryPath(entry) {
        return sysPath2.join(this.watchPath, sysPath2.relative(this.watchPath, entry.fullPath));
      }
      filterPath(entry) {
        const { stats } = entry;
        if (stats && stats.isSymbolicLink())
          return this.filterDir(entry);
        const resolvedPath = this.entryPath(entry);
        return this.fsw._isntIgnored(resolvedPath, stats) && this.fsw._hasReadPermissions(stats);
      }
      filterDir(entry) {
        return this.fsw._isntIgnored(this.entryPath(entry), entry.stats);
      }
    };
    FSWatcher = class extends EventEmitter {
      // Not indenting methods for history sake; for now.
      constructor(_opts = {}) {
        super();
        this.closed = false;
        this._closers = /* @__PURE__ */ new Map();
        this._ignoredPaths = /* @__PURE__ */ new Set();
        this._throttled = /* @__PURE__ */ new Map();
        this._streams = /* @__PURE__ */ new Set();
        this._symlinkPaths = /* @__PURE__ */ new Map();
        this._watched = /* @__PURE__ */ new Map();
        this._pendingWrites = /* @__PURE__ */ new Map();
        this._pendingUnlinks = /* @__PURE__ */ new Map();
        this._readyCount = 0;
        this._readyEmitted = false;
        const awf = _opts.awaitWriteFinish;
        const DEF_AWF = { stabilityThreshold: 2e3, pollInterval: 100 };
        const opts = {
          // Defaults
          persistent: true,
          ignoreInitial: false,
          ignorePermissionErrors: false,
          interval: 100,
          binaryInterval: 300,
          followSymlinks: true,
          usePolling: false,
          // useAsync: false,
          atomic: true,
          // NOTE: overwritten later (depends on usePolling)
          ..._opts,
          // Change format
          ignored: _opts.ignored ? arrify(_opts.ignored) : arrify([]),
          awaitWriteFinish: awf === true ? DEF_AWF : typeof awf === "object" ? { ...DEF_AWF, ...awf } : false
        };
        if (isIBMi)
          opts.usePolling = true;
        if (opts.atomic === void 0)
          opts.atomic = !opts.usePolling;
        const envPoll = process.env.CHOKIDAR_USEPOLLING;
        if (envPoll !== void 0) {
          const envLower = envPoll.toLowerCase();
          if (envLower === "false" || envLower === "0")
            opts.usePolling = false;
          else if (envLower === "true" || envLower === "1")
            opts.usePolling = true;
          else
            opts.usePolling = !!envLower;
        }
        const envInterval = process.env.CHOKIDAR_INTERVAL;
        if (envInterval)
          opts.interval = Number.parseInt(envInterval, 10);
        let readyCalls = 0;
        this._emitReady = () => {
          readyCalls++;
          if (readyCalls >= this._readyCount) {
            this._emitReady = EMPTY_FN;
            this._readyEmitted = true;
            process.nextTick(() => this.emit(EVENTS.READY));
          }
        };
        this._emitRaw = (...args) => this.emit(EVENTS.RAW, ...args);
        this._boundRemove = this._remove.bind(this);
        this.options = opts;
        this._nodeFsHandler = new NodeFsHandler(this);
        Object.freeze(opts);
      }
      _addIgnoredPath(matcher) {
        if (isMatcherObject(matcher)) {
          for (const ignored of this._ignoredPaths) {
            if (isMatcherObject(ignored) && ignored.path === matcher.path && ignored.recursive === matcher.recursive) {
              return;
            }
          }
        }
        this._ignoredPaths.add(matcher);
      }
      _removeIgnoredPath(matcher) {
        this._ignoredPaths.delete(matcher);
        if (typeof matcher === "string") {
          for (const ignored of this._ignoredPaths) {
            if (isMatcherObject(ignored) && ignored.path === matcher) {
              this._ignoredPaths.delete(ignored);
            }
          }
        }
      }
      // Public methods
      /**
       * Adds paths to be watched on an existing FSWatcher instance.
       * @param paths_ file or file list. Other arguments are unused
       */
      add(paths_, _origAdd, _internal) {
        const { cwd } = this.options;
        this.closed = false;
        this._closePromise = void 0;
        let paths = unifyPaths(paths_);
        if (cwd) {
          paths = paths.map((path3) => {
            const absPath = getAbsolutePath(path3, cwd);
            return absPath;
          });
        }
        paths.forEach((path3) => {
          this._removeIgnoredPath(path3);
        });
        this._userIgnored = void 0;
        if (!this._readyCount)
          this._readyCount = 0;
        this._readyCount += paths.length;
        Promise.all(paths.map(async (path3) => {
          const res = await this._nodeFsHandler._addToNodeFs(path3, !_internal, void 0, 0, _origAdd);
          if (res)
            this._emitReady();
          return res;
        })).then((results) => {
          if (this.closed)
            return;
          results.forEach((item) => {
            if (item)
              this.add(sysPath2.dirname(item), sysPath2.basename(_origAdd || item));
          });
        });
        return this;
      }
      /**
       * Close watchers or start ignoring events from specified paths.
       */
      unwatch(paths_) {
        if (this.closed)
          return this;
        const paths = unifyPaths(paths_);
        const { cwd } = this.options;
        paths.forEach((path3) => {
          if (!sysPath2.isAbsolute(path3) && !this._closers.has(path3)) {
            if (cwd)
              path3 = sysPath2.join(cwd, path3);
            path3 = sysPath2.resolve(path3);
          }
          this._closePath(path3);
          this._addIgnoredPath(path3);
          if (this._watched.has(path3)) {
            this._addIgnoredPath({
              path: path3,
              recursive: true
            });
          }
          this._userIgnored = void 0;
        });
        return this;
      }
      /**
       * Close watchers and remove all listeners from watched paths.
       */
      close() {
        if (this._closePromise) {
          return this._closePromise;
        }
        this.closed = true;
        this.removeAllListeners();
        const closers = [];
        this._closers.forEach((closerList) => closerList.forEach((closer) => {
          const promise = closer();
          if (promise instanceof Promise)
            closers.push(promise);
        }));
        this._streams.forEach((stream) => stream.destroy());
        this._userIgnored = void 0;
        this._readyCount = 0;
        this._readyEmitted = false;
        this._watched.forEach((dirent) => dirent.dispose());
        this._closers.clear();
        this._watched.clear();
        this._streams.clear();
        this._symlinkPaths.clear();
        this._throttled.clear();
        this._closePromise = closers.length ? Promise.all(closers).then(() => void 0) : Promise.resolve();
        return this._closePromise;
      }
      /**
       * Expose list of watched paths
       * @returns for chaining
       */
      getWatched() {
        const watchList = {};
        this._watched.forEach((entry, dir) => {
          const key = this.options.cwd ? sysPath2.relative(this.options.cwd, dir) : dir;
          const index = key || ONE_DOT;
          watchList[index] = entry.getChildren().sort();
        });
        return watchList;
      }
      emitWithAll(event, args) {
        this.emit(event, ...args);
        if (event !== EVENTS.ERROR)
          this.emit(EVENTS.ALL, event, ...args);
      }
      // Common helpers
      // --------------
      /**
       * Normalize and emit events.
       * Calling _emit DOES NOT MEAN emit() would be called!
       * @param event Type of event
       * @param path File or directory path
       * @param stats arguments to be passed with event
       * @returns the error if defined, otherwise the value of the FSWatcher instance's `closed` flag
       */
      async _emit(event, path3, stats) {
        if (this.closed)
          return;
        const opts = this.options;
        if (isWindows)
          path3 = sysPath2.normalize(path3);
        if (opts.cwd)
          path3 = sysPath2.relative(opts.cwd, path3);
        const args = [path3];
        if (stats != null)
          args.push(stats);
        const awf = opts.awaitWriteFinish;
        let pw;
        if (awf && (pw = this._pendingWrites.get(path3))) {
          pw.lastChange = /* @__PURE__ */ new Date();
          return this;
        }
        if (opts.atomic) {
          if (event === EVENTS.UNLINK) {
            this._pendingUnlinks.set(path3, [event, ...args]);
            setTimeout(() => {
              this._pendingUnlinks.forEach((entry, path4) => {
                this.emit(...entry);
                this.emit(EVENTS.ALL, ...entry);
                this._pendingUnlinks.delete(path4);
              });
            }, typeof opts.atomic === "number" ? opts.atomic : 100);
            return this;
          }
          if (event === EVENTS.ADD && this._pendingUnlinks.has(path3)) {
            event = EVENTS.CHANGE;
            this._pendingUnlinks.delete(path3);
          }
        }
        if (awf && (event === EVENTS.ADD || event === EVENTS.CHANGE) && this._readyEmitted) {
          const awfEmit = (err, stats2) => {
            if (err) {
              event = EVENTS.ERROR;
              args[0] = err;
              this.emitWithAll(event, args);
            } else if (stats2) {
              if (args.length > 1) {
                args[1] = stats2;
              } else {
                args.push(stats2);
              }
              this.emitWithAll(event, args);
            }
          };
          this._awaitWriteFinish(path3, awf.stabilityThreshold, event, awfEmit);
          return this;
        }
        if (event === EVENTS.CHANGE) {
          const isThrottled = !this._throttle(EVENTS.CHANGE, path3, 50);
          if (isThrottled)
            return this;
        }
        if (opts.alwaysStat && stats === void 0 && (event === EVENTS.ADD || event === EVENTS.ADD_DIR || event === EVENTS.CHANGE)) {
          const fullPath = opts.cwd ? sysPath2.join(opts.cwd, path3) : path3;
          let stats2;
          try {
            stats2 = await stat3(fullPath);
          } catch (err) {
          }
          if (!stats2 || this.closed)
            return;
          args.push(stats2);
        }
        this.emitWithAll(event, args);
        return this;
      }
      /**
       * Common handler for errors
       * @returns The error if defined, otherwise the value of the FSWatcher instance's `closed` flag
       */
      _handleError(error) {
        const code = error && error.code;
        if (error && code !== "ENOENT" && code !== "ENOTDIR" && (!this.options.ignorePermissionErrors || code !== "EPERM" && code !== "EACCES")) {
          this.emit(EVENTS.ERROR, error);
        }
        return error || this.closed;
      }
      /**
       * Helper utility for throttling
       * @param actionType type being throttled
       * @param path being acted upon
       * @param timeout duration of time to suppress duplicate actions
       * @returns tracking object or false if action should be suppressed
       */
      _throttle(actionType, path3, timeout) {
        if (!this._throttled.has(actionType)) {
          this._throttled.set(actionType, /* @__PURE__ */ new Map());
        }
        const action = this._throttled.get(actionType);
        if (!action)
          throw new Error("invalid throttle");
        const actionPath = action.get(path3);
        if (actionPath) {
          actionPath.count++;
          return false;
        }
        let timeoutObject;
        const clear = () => {
          const item = action.get(path3);
          const count = item ? item.count : 0;
          action.delete(path3);
          clearTimeout(timeoutObject);
          if (item)
            clearTimeout(item.timeoutObject);
          return count;
        };
        timeoutObject = setTimeout(clear, timeout);
        const thr = { timeoutObject, clear, count: 0 };
        action.set(path3, thr);
        return thr;
      }
      _incrReadyCount() {
        return this._readyCount++;
      }
      /**
       * Awaits write operation to finish.
       * Polls a newly created file for size variations. When files size does not change for 'threshold' milliseconds calls callback.
       * @param path being acted upon
       * @param threshold Time in milliseconds a file size must be fixed before acknowledging write OP is finished
       * @param event
       * @param awfEmit Callback to be called when ready for event to be emitted.
       */
      _awaitWriteFinish(path3, threshold, event, awfEmit) {
        const awf = this.options.awaitWriteFinish;
        if (typeof awf !== "object")
          return;
        const pollInterval = awf.pollInterval;
        let timeoutHandler;
        let fullPath = path3;
        if (this.options.cwd && !sysPath2.isAbsolute(path3)) {
          fullPath = sysPath2.join(this.options.cwd, path3);
        }
        const now = /* @__PURE__ */ new Date();
        const writes = this._pendingWrites;
        function awaitWriteFinishFn(prevStat) {
          statcb(fullPath, (err, curStat) => {
            if (err || !writes.has(path3)) {
              if (err && err.code !== "ENOENT")
                awfEmit(err);
              return;
            }
            const now2 = Number(/* @__PURE__ */ new Date());
            if (prevStat && curStat.size !== prevStat.size) {
              writes.get(path3).lastChange = now2;
            }
            const pw = writes.get(path3);
            const df = now2 - pw.lastChange;
            if (df >= threshold) {
              writes.delete(path3);
              awfEmit(void 0, curStat);
            } else {
              timeoutHandler = setTimeout(awaitWriteFinishFn, pollInterval, curStat);
            }
          });
        }
        if (!writes.has(path3)) {
          writes.set(path3, {
            lastChange: now,
            cancelWait: () => {
              writes.delete(path3);
              clearTimeout(timeoutHandler);
              return event;
            }
          });
          timeoutHandler = setTimeout(awaitWriteFinishFn, pollInterval);
        }
      }
      /**
       * Determines whether user has asked to ignore this path.
       */
      _isIgnored(path3, stats) {
        if (this.options.atomic && DOT_RE.test(path3))
          return true;
        if (!this._userIgnored) {
          const { cwd } = this.options;
          const ign = this.options.ignored;
          const ignored = (ign || []).map(normalizeIgnored(cwd));
          const ignoredPaths = [...this._ignoredPaths];
          const list2 = [...ignoredPaths.map(normalizeIgnored(cwd)), ...ignored];
          this._userIgnored = anymatch(list2, void 0);
        }
        return this._userIgnored(path3, stats);
      }
      _isntIgnored(path3, stat4) {
        return !this._isIgnored(path3, stat4);
      }
      /**
       * Provides a set of common helpers and properties relating to symlink handling.
       * @param path file or directory pattern being watched
       */
      _getWatchHelpers(path3) {
        return new WatchHelper(path3, this.options.followSymlinks, this);
      }
      // Directory helpers
      // -----------------
      /**
       * Provides directory tracking objects
       * @param directory path of the directory
       */
      _getWatchedDir(directory) {
        const dir = sysPath2.resolve(directory);
        if (!this._watched.has(dir))
          this._watched.set(dir, new DirEntry(dir, this._boundRemove));
        return this._watched.get(dir);
      }
      // File helpers
      // ------------
      /**
       * Check for read permissions: https://stackoverflow.com/a/11781404/1358405
       */
      _hasReadPermissions(stats) {
        if (this.options.ignorePermissionErrors)
          return true;
        return Boolean(Number(stats.mode) & 256);
      }
      /**
       * Handles emitting unlink events for
       * files and directories, and via recursion, for
       * files and directories within directories that are unlinked
       * @param directory within which the following item is located
       * @param item      base path of item/directory
       */
      _remove(directory, item, isDirectory) {
        const path3 = sysPath2.join(directory, item);
        const fullPath = sysPath2.resolve(path3);
        isDirectory = isDirectory != null ? isDirectory : this._watched.has(path3) || this._watched.has(fullPath);
        if (!this._throttle("remove", path3, 100))
          return;
        if (!isDirectory && this._watched.size === 1) {
          this.add(directory, item, true);
        }
        const wp = this._getWatchedDir(path3);
        const nestedDirectoryChildren = wp.getChildren();
        nestedDirectoryChildren.forEach((nested) => this._remove(path3, nested));
        const parent = this._getWatchedDir(directory);
        const wasTracked = parent.has(item);
        parent.remove(item);
        if (this._symlinkPaths.has(fullPath)) {
          this._symlinkPaths.delete(fullPath);
        }
        let relPath = path3;
        if (this.options.cwd)
          relPath = sysPath2.relative(this.options.cwd, path3);
        if (this.options.awaitWriteFinish && this._pendingWrites.has(relPath)) {
          const event = this._pendingWrites.get(relPath).cancelWait();
          if (event === EVENTS.ADD)
            return;
        }
        this._watched.delete(path3);
        this._watched.delete(fullPath);
        const eventName = isDirectory ? EVENTS.UNLINK_DIR : EVENTS.UNLINK;
        if (wasTracked && !this._isIgnored(path3))
          this._emit(eventName, path3);
        this._closePath(path3);
      }
      /**
       * Closes all watchers for a path
       */
      _closePath(path3) {
        this._closeFile(path3);
        const dir = sysPath2.dirname(path3);
        this._getWatchedDir(dir).remove(sysPath2.basename(path3));
      }
      /**
       * Closes only file-specific watchers
       */
      _closeFile(path3) {
        const closers = this._closers.get(path3);
        if (!closers)
          return;
        closers.forEach((closer) => closer());
        this._closers.delete(path3);
      }
      _addPathCloser(path3, closer) {
        if (!closer)
          return;
        let list2 = this._closers.get(path3);
        if (!list2) {
          list2 = [];
          this._closers.set(path3, list2);
        }
        list2.push(closer);
      }
      _readdirp(root, opts) {
        if (this.closed)
          return;
        const options = { type: EVENTS.ALL, alwaysStat: true, lstat: true, ...opts, depth: 0 };
        let stream = readdirp(root, options);
        this._streams.add(stream);
        stream.once(STR_CLOSE, () => {
          stream = void 0;
        });
        stream.once(STR_END, () => {
          if (stream) {
            this._streams.delete(stream);
            stream = void 0;
          }
        });
        return stream;
      }
    };
    esm_default = { watch, FSWatcher };
  }
});

// src/main.ts
import fs4 from "node:fs";

// src/index/InvertedIndex.ts
var InvertedIndex = class {
  refs = /* @__PURE__ */ new Map();
  add(symbolId, location) {
    const existing = this.refs.get(symbolId);
    if (existing === void 0) {
      this.refs.set(symbolId, [location]);
      return;
    }
    existing.push(location);
  }
  deleteAll(symbolId) {
    this.refs.delete(symbolId);
  }
  deleteByFile(fileId) {
    for (const [symbolId, locations] of this.refs) {
      const next = locations.filter((location) => location.fileId !== fileId);
      if (next.length === 0) {
        this.refs.delete(symbolId);
        continue;
      }
      if (next.length !== locations.length) {
        this.refs.set(symbolId, next);
      }
    }
  }
  lookup(symbolId) {
    return this.refs.get(symbolId) ?? [];
  }
  count(symbolId) {
    return this.refs.get(symbolId)?.length ?? 0;
  }
  clear() {
    this.refs.clear();
  }
};

// src/index/StringPool.ts
var StringPool = class {
  values = [""];
  ids = /* @__PURE__ */ new Map();
  intern(value) {
    const existing = this.ids.get(value);
    if (existing !== void 0) {
      return existing;
    }
    const id = this.values.length;
    this.values.push(value);
    this.ids.set(value, id);
    return id;
  }
  get(id) {
    return this.values[id] ?? "";
  }
  find(value) {
    return this.ids.get(value);
  }
  size() {
    return this.values.length - 1;
  }
};

// src/index/Index.ts
var Index = class {
  pool = new StringPool();
  symbols = /* @__PURE__ */ new Map();
  byFile = /* @__PURE__ */ new Map();
  refs = new InvertedIndex();
  allSymbolsCache = null;
  strings() {
    return this.pool;
  }
  fileId(filePath) {
    return this.pool.intern(filePath);
  }
  fileIdOf(filePath) {
    return this.pool.find(filePath);
  }
  filePath(fileId) {
    return this.pool.get(fileId);
  }
  insert(symbol) {
    if (symbol.fullName.length === 0 || this.symbols.has(symbol.fullName)) {
      return false;
    }
    symbol.id = this.pool.intern(symbol.fullName);
    this.symbols.set(symbol.fullName, symbol);
    const names = this.byFile.get(symbol.fileId);
    if (names === void 0) {
      this.byFile.set(symbol.fileId, [symbol.fullName]);
    } else {
      names.push(symbol.fullName);
    }
    this.allSymbolsCache = null;
    return true;
  }
  deleteByFile(fileId) {
    for (const fullName of this.byFile.get(fileId) ?? []) {
      const symbol = this.symbols.get(fullName);
      if (symbol !== void 0) {
        this.refs.deleteAll(symbol.id);
      }
      this.symbols.delete(fullName);
    }
    this.byFile.delete(fileId);
    this.refs.deleteByFile(fileId);
    this.allSymbolsCache = null;
  }
  clear() {
    this.symbols.clear();
    this.byFile.clear();
    this.refs.clear();
    this.allSymbolsCache = null;
  }
  lookup(fullName) {
    return this.symbols.get(fullName);
  }
  has(fullName) {
    return this.symbols.has(fullName);
  }
  allSymbols() {
    if (this.allSymbolsCache === null) {
      this.allSymbolsCache = Array.from(this.symbols.values());
    }
    return this.allSymbolsCache;
  }
  symbolsByFile(fileId) {
    const names = this.byFile.get(fileId) ?? [];
    return names.flatMap((name) => {
      const symbol = this.symbols.get(name);
      return symbol === void 0 ? [] : [symbol];
    });
  }
  fileIds() {
    return Array.from(this.byFile.keys());
  }
  addReference(fullName, location) {
    const symbol = this.symbols.get(fullName);
    if (symbol === void 0) {
      return false;
    }
    this.refs.add(symbol.id, location);
    return true;
  }
  referencesTo(fullName) {
    const symbol = this.symbols.get(fullName);
    return symbol === void 0 ? [] : this.refs.lookup(symbol.id);
  }
  stats() {
    let referenceCount = 0;
    for (const symbol of this.symbols.values()) {
      referenceCount += this.refs.count(symbol.id);
    }
    return { symbolCount: this.symbols.size, fileCount: this.byFile.size, referenceCount };
  }
};

// node_modules/acorn/dist/acorn.mjs
var astralIdentifierCodes = [509, 0, 227, 0, 150, 4, 294, 9, 1368, 2, 2, 1, 6, 3, 41, 2, 5, 0, 166, 1, 574, 3, 9, 9, 7, 9, 32, 4, 318, 1, 78, 5, 71, 10, 50, 3, 123, 2, 54, 14, 32, 10, 3, 1, 11, 3, 46, 10, 8, 0, 46, 9, 7, 2, 37, 13, 2, 9, 6, 1, 45, 0, 13, 2, 49, 13, 9, 3, 2, 11, 83, 11, 7, 0, 3, 0, 158, 11, 6, 9, 7, 3, 56, 1, 2, 6, 3, 1, 3, 2, 10, 0, 11, 1, 3, 6, 4, 4, 68, 8, 2, 0, 3, 0, 2, 3, 2, 4, 2, 0, 15, 1, 83, 17, 10, 9, 5, 0, 82, 19, 13, 9, 214, 6, 3, 8, 28, 1, 83, 16, 16, 9, 82, 12, 9, 9, 7, 19, 58, 14, 5, 9, 243, 14, 166, 9, 71, 5, 2, 1, 3, 3, 2, 0, 2, 1, 13, 9, 120, 6, 3, 6, 4, 0, 29, 9, 41, 6, 2, 3, 9, 0, 10, 10, 47, 15, 199, 7, 137, 9, 54, 7, 2, 7, 17, 9, 57, 21, 2, 13, 123, 5, 4, 0, 2, 1, 2, 6, 2, 0, 9, 9, 49, 4, 2, 1, 2, 4, 9, 9, 55, 9, 266, 3, 10, 1, 2, 0, 49, 6, 4, 4, 14, 10, 5350, 0, 7, 14, 11465, 27, 2343, 9, 87, 9, 39, 4, 60, 6, 26, 9, 535, 9, 470, 0, 2, 54, 8, 3, 82, 0, 12, 1, 19628, 1, 4178, 9, 519, 45, 3, 22, 543, 4, 4, 5, 9, 7, 3, 6, 31, 3, 149, 2, 1418, 49, 513, 54, 5, 49, 9, 0, 15, 0, 23, 4, 2, 14, 1361, 6, 2, 16, 3, 6, 2, 1, 2, 4, 101, 0, 161, 6, 10, 9, 357, 0, 62, 13, 499, 13, 245, 1, 2, 9, 233, 0, 3, 0, 8, 1, 6, 0, 475, 6, 110, 6, 6, 9, 4759, 9, 787719, 239];
var astralIdentifierStartCodes = [0, 11, 2, 25, 2, 18, 2, 1, 2, 14, 3, 13, 35, 122, 70, 52, 268, 28, 4, 48, 48, 31, 14, 29, 6, 37, 11, 29, 3, 35, 5, 7, 2, 4, 43, 157, 19, 35, 5, 35, 5, 39, 9, 51, 13, 10, 2, 14, 2, 6, 2, 1, 2, 10, 2, 14, 2, 6, 2, 1, 4, 51, 13, 310, 10, 21, 11, 7, 25, 5, 2, 41, 2, 8, 70, 5, 3, 0, 2, 43, 2, 1, 4, 0, 3, 22, 11, 22, 10, 30, 66, 18, 2, 1, 11, 21, 11, 25, 7, 25, 39, 55, 7, 1, 65, 0, 16, 3, 2, 2, 2, 28, 43, 28, 4, 28, 36, 7, 2, 27, 28, 53, 11, 21, 11, 18, 14, 17, 111, 72, 56, 50, 14, 50, 14, 35, 39, 27, 10, 22, 251, 41, 7, 1, 17, 5, 57, 28, 11, 0, 9, 21, 43, 17, 47, 20, 28, 22, 13, 52, 58, 1, 3, 0, 14, 44, 33, 24, 27, 35, 30, 0, 3, 0, 9, 34, 4, 0, 13, 47, 15, 3, 22, 0, 2, 0, 36, 17, 2, 24, 20, 1, 64, 6, 2, 0, 2, 3, 2, 14, 2, 9, 8, 46, 39, 7, 3, 1, 3, 21, 2, 6, 2, 1, 2, 4, 4, 0, 19, 0, 13, 4, 31, 9, 2, 0, 3, 0, 2, 37, 2, 0, 26, 0, 2, 0, 45, 52, 19, 3, 21, 2, 31, 47, 21, 1, 2, 0, 185, 46, 42, 3, 37, 47, 21, 0, 60, 42, 14, 0, 72, 26, 38, 6, 186, 43, 117, 63, 32, 7, 3, 0, 3, 7, 2, 1, 2, 23, 16, 0, 2, 0, 95, 7, 3, 38, 17, 0, 2, 0, 29, 0, 11, 39, 8, 0, 22, 0, 12, 45, 20, 0, 19, 72, 200, 32, 32, 8, 2, 36, 18, 0, 50, 29, 113, 6, 2, 1, 2, 37, 22, 0, 26, 5, 2, 1, 2, 31, 15, 0, 24, 43, 261, 18, 16, 0, 2, 12, 2, 33, 125, 0, 80, 921, 103, 110, 18, 195, 2637, 96, 16, 1071, 18, 5, 26, 3994, 6, 582, 6842, 29, 1763, 568, 8, 30, 18, 78, 18, 29, 19, 47, 17, 3, 32, 20, 6, 18, 433, 44, 212, 63, 33, 24, 3, 24, 45, 74, 6, 0, 67, 12, 65, 1, 2, 0, 15, 4, 10, 7381, 42, 31, 98, 114, 8702, 3, 2, 6, 2, 1, 2, 290, 16, 0, 30, 2, 3, 0, 15, 3, 9, 395, 2309, 106, 6, 12, 4, 8, 8, 9, 5991, 84, 2, 70, 2, 1, 3, 0, 3, 1, 3, 3, 2, 11, 2, 0, 2, 6, 2, 64, 2, 3, 3, 7, 2, 6, 2, 27, 2, 3, 2, 4, 2, 0, 4, 6, 2, 339, 3, 24, 2, 24, 2, 30, 2, 24, 2, 30, 2, 24, 2, 30, 2, 24, 2, 30, 2, 24, 2, 7, 1845, 30, 7, 5, 262, 61, 147, 44, 11, 6, 17, 0, 322, 29, 19, 43, 485, 27, 229, 29, 3, 0, 208, 30, 2, 2, 2, 1, 2, 6, 3, 4, 10, 1, 225, 6, 2, 3, 2, 1, 2, 14, 2, 196, 60, 67, 8, 0, 1205, 3, 2, 26, 2, 1, 2, 0, 3, 0, 2, 9, 2, 3, 2, 0, 2, 0, 7, 0, 5, 0, 2, 0, 2, 0, 2, 2, 2, 1, 2, 0, 3, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 1, 2, 0, 3, 3, 2, 6, 2, 3, 2, 3, 2, 0, 2, 9, 2, 16, 6, 2, 2, 4, 2, 16, 4421, 42719, 33, 4381, 3, 5773, 3, 7472, 16, 621, 2467, 541, 1507, 4938, 6, 8489];
var nonASCIIidentifierChars = "\u200C\u200D\xB7\u0300-\u036F\u0387\u0483-\u0487\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u0610-\u061A\u064B-\u0669\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED\u06F0-\u06F9\u0711\u0730-\u074A\u07A6-\u07B0\u07C0-\u07C9\u07EB-\u07F3\u07FD\u0816-\u0819\u081B-\u0823\u0825-\u0827\u0829-\u082D\u0859-\u085B\u0897-\u089F\u08CA-\u08E1\u08E3-\u0903\u093A-\u093C\u093E-\u094F\u0951-\u0957\u0962\u0963\u0966-\u096F\u0981-\u0983\u09BC\u09BE-\u09C4\u09C7\u09C8\u09CB-\u09CD\u09D7\u09E2\u09E3\u09E6-\u09EF\u09FE\u0A01-\u0A03\u0A3C\u0A3E-\u0A42\u0A47\u0A48\u0A4B-\u0A4D\u0A51\u0A66-\u0A71\u0A75\u0A81-\u0A83\u0ABC\u0ABE-\u0AC5\u0AC7-\u0AC9\u0ACB-\u0ACD\u0AE2\u0AE3\u0AE6-\u0AEF\u0AFA-\u0AFF\u0B01-\u0B03\u0B3C\u0B3E-\u0B44\u0B47\u0B48\u0B4B-\u0B4D\u0B55-\u0B57\u0B62\u0B63\u0B66-\u0B6F\u0B82\u0BBE-\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCD\u0BD7\u0BE6-\u0BEF\u0C00-\u0C04\u0C3C\u0C3E-\u0C44\u0C46-\u0C48\u0C4A-\u0C4D\u0C55\u0C56\u0C62\u0C63\u0C66-\u0C6F\u0C81-\u0C83\u0CBC\u0CBE-\u0CC4\u0CC6-\u0CC8\u0CCA-\u0CCD\u0CD5\u0CD6\u0CE2\u0CE3\u0CE6-\u0CEF\u0CF3\u0D00-\u0D03\u0D3B\u0D3C\u0D3E-\u0D44\u0D46-\u0D48\u0D4A-\u0D4D\u0D57\u0D62\u0D63\u0D66-\u0D6F\u0D81-\u0D83\u0DCA\u0DCF-\u0DD4\u0DD6\u0DD8-\u0DDF\u0DE6-\u0DEF\u0DF2\u0DF3\u0E31\u0E34-\u0E3A\u0E47-\u0E4E\u0E50-\u0E59\u0EB1\u0EB4-\u0EBC\u0EC8-\u0ECE\u0ED0-\u0ED9\u0F18\u0F19\u0F20-\u0F29\u0F35\u0F37\u0F39\u0F3E\u0F3F\u0F71-\u0F84\u0F86\u0F87\u0F8D-\u0F97\u0F99-\u0FBC\u0FC6\u102B-\u103E\u1040-\u1049\u1056-\u1059\u105E-\u1060\u1062-\u1064\u1067-\u106D\u1071-\u1074\u1082-\u108D\u108F-\u109D\u135D-\u135F\u1369-\u1371\u1712-\u1715\u1732-\u1734\u1752\u1753\u1772\u1773\u17B4-\u17D3\u17DD\u17E0-\u17E9\u180B-\u180D\u180F-\u1819\u18A9\u1920-\u192B\u1930-\u193B\u1946-\u194F\u19D0-\u19DA\u1A17-\u1A1B\u1A55-\u1A5E\u1A60-\u1A7C\u1A7F-\u1A89\u1A90-\u1A99\u1AB0-\u1ABD\u1ABF-\u1ADD\u1AE0-\u1AEB\u1B00-\u1B04\u1B34-\u1B44\u1B50-\u1B59\u1B6B-\u1B73\u1B80-\u1B82\u1BA1-\u1BAD\u1BB0-\u1BB9\u1BE6-\u1BF3\u1C24-\u1C37\u1C40-\u1C49\u1C50-\u1C59\u1CD0-\u1CD2\u1CD4-\u1CE8\u1CED\u1CF4\u1CF7-\u1CF9\u1DC0-\u1DFF\u200C\u200D\u203F\u2040\u2054\u20D0-\u20DC\u20E1\u20E5-\u20F0\u2CEF-\u2CF1\u2D7F\u2DE0-\u2DFF\u302A-\u302F\u3099\u309A\u30FB\uA620-\uA629\uA66F\uA674-\uA67D\uA69E\uA69F\uA6F0\uA6F1\uA802\uA806\uA80B\uA823-\uA827\uA82C\uA880\uA881\uA8B4-\uA8C5\uA8D0-\uA8D9\uA8E0-\uA8F1\uA8FF-\uA909\uA926-\uA92D\uA947-\uA953\uA980-\uA983\uA9B3-\uA9C0\uA9D0-\uA9D9\uA9E5\uA9F0-\uA9F9\uAA29-\uAA36\uAA43\uAA4C\uAA4D\uAA50-\uAA59\uAA7B-\uAA7D\uAAB0\uAAB2-\uAAB4\uAAB7\uAAB8\uAABE\uAABF\uAAC1\uAAEB-\uAAEF\uAAF5\uAAF6\uABE3-\uABEA\uABEC\uABED\uABF0-\uABF9\uFB1E\uFE00-\uFE0F\uFE20-\uFE2F\uFE33\uFE34\uFE4D-\uFE4F\uFF10-\uFF19\uFF3F\uFF65";
var nonASCIIidentifierStartChars = "\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u0531-\u0556\u0559\u0560-\u0588\u05D0-\u05EA\u05EF-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u0860-\u086A\u0870-\u0887\u0889-\u088F\u08A0-\u08C9\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0980\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u09FC\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0AF9\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C58-\u0C5A\u0C5C\u0C5D\u0C60\u0C61\u0C80\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDC-\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D04-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D54-\u0D56\u0D5F-\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E86-\u0E8A\u0E8C-\u0EA3\u0EA5\u0EA7-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u1711\u171F-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1878\u1880-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4C\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1C80-\u1C8A\u1C90-\u1CBA\u1CBD-\u1CBF\u1CE9-\u1CEC\u1CEE-\u1CF3\u1CF5\u1CF6\u1CFA\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2118-\u211D\u2124\u2126\u2128\u212A-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303C\u3041-\u3096\u309B-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312F\u3131-\u318E\u31A0-\u31BF\u31F0-\u31FF\u3400-\u4DBF\u4E00-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA66E\uA67F-\uA69D\uA6A0-\uA6EF\uA717-\uA71F\uA722-\uA788\uA78B-\uA7DC\uA7F1-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA8FD\uA8FE\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uA9E0-\uA9E4\uA9E6-\uA9EF\uA9FA-\uA9FE\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA7E-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB69\uAB70-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC";
var reservedWords = {
  3: "abstract boolean byte char class double enum export extends final float goto implements import int interface long native package private protected public short static super synchronized throws transient volatile",
  5: "class enum extends super const export import",
  6: "enum",
  strict: "implements interface let package private protected public static yield",
  strictBind: "eval arguments"
};
var ecma5AndLessKeywords = "break case catch continue debugger default do else finally for function if return switch throw try var while with null true false instanceof typeof void delete new in this";
var keywords$1 = {
  5: ecma5AndLessKeywords,
  "5module": ecma5AndLessKeywords + " export import",
  6: ecma5AndLessKeywords + " const class extends export import super"
};
var keywordRelationalOperator = /^in(stanceof)?$/;
var nonASCIIidentifierStart = new RegExp("[" + nonASCIIidentifierStartChars + "]");
var nonASCIIidentifier = new RegExp("[" + nonASCIIidentifierStartChars + nonASCIIidentifierChars + "]");
function isInAstralSet(code, set) {
  var pos = 65536;
  for (var i2 = 0; i2 < set.length; i2 += 2) {
    pos += set[i2];
    if (pos > code) {
      return false;
    }
    pos += set[i2 + 1];
    if (pos >= code) {
      return true;
    }
  }
  return false;
}
function isIdentifierStart(code, astral) {
  if (code < 65) {
    return code === 36;
  }
  if (code < 91) {
    return true;
  }
  if (code < 97) {
    return code === 95;
  }
  if (code < 123) {
    return true;
  }
  if (code <= 65535) {
    return code >= 170 && nonASCIIidentifierStart.test(String.fromCharCode(code));
  }
  if (astral === false) {
    return false;
  }
  return isInAstralSet(code, astralIdentifierStartCodes);
}
function isIdentifierChar(code, astral) {
  if (code < 48) {
    return code === 36;
  }
  if (code < 58) {
    return true;
  }
  if (code < 65) {
    return false;
  }
  if (code < 91) {
    return true;
  }
  if (code < 97) {
    return code === 95;
  }
  if (code < 123) {
    return true;
  }
  if (code <= 65535) {
    return code >= 170 && nonASCIIidentifier.test(String.fromCharCode(code));
  }
  if (astral === false) {
    return false;
  }
  return isInAstralSet(code, astralIdentifierStartCodes) || isInAstralSet(code, astralIdentifierCodes);
}
var TokenType = function TokenType2(label, conf) {
  if (conf === void 0) conf = {};
  this.label = label;
  this.keyword = conf.keyword;
  this.beforeExpr = !!conf.beforeExpr;
  this.startsExpr = !!conf.startsExpr;
  this.isLoop = !!conf.isLoop;
  this.isAssign = !!conf.isAssign;
  this.prefix = !!conf.prefix;
  this.postfix = !!conf.postfix;
  this.binop = conf.binop || null;
  this.updateContext = null;
};
function binop(name, prec) {
  return new TokenType(name, { beforeExpr: true, binop: prec });
}
var beforeExpr = { beforeExpr: true };
var startsExpr = { startsExpr: true };
var keywords = {};
function kw(name, options) {
  if (options === void 0) options = {};
  options.keyword = name;
  return keywords[name] = new TokenType(name, options);
}
var types$1 = {
  num: new TokenType("num", startsExpr),
  regexp: new TokenType("regexp", startsExpr),
  string: new TokenType("string", startsExpr),
  name: new TokenType("name", startsExpr),
  privateId: new TokenType("privateId", startsExpr),
  eof: new TokenType("eof"),
  // Punctuation token types.
  bracketL: new TokenType("[", { beforeExpr: true, startsExpr: true }),
  bracketR: new TokenType("]"),
  braceL: new TokenType("{", { beforeExpr: true, startsExpr: true }),
  braceR: new TokenType("}"),
  parenL: new TokenType("(", { beforeExpr: true, startsExpr: true }),
  parenR: new TokenType(")"),
  comma: new TokenType(",", beforeExpr),
  semi: new TokenType(";", beforeExpr),
  colon: new TokenType(":", beforeExpr),
  dot: new TokenType("."),
  question: new TokenType("?", beforeExpr),
  questionDot: new TokenType("?."),
  arrow: new TokenType("=>", beforeExpr),
  template: new TokenType("template"),
  invalidTemplate: new TokenType("invalidTemplate"),
  ellipsis: new TokenType("...", beforeExpr),
  backQuote: new TokenType("`", startsExpr),
  dollarBraceL: new TokenType("${", { beforeExpr: true, startsExpr: true }),
  // Operators. These carry several kinds of properties to help the
  // parser use them properly (the presence of these properties is
  // what categorizes them as operators).
  //
  // `binop`, when present, specifies that this operator is a binary
  // operator, and will refer to its precedence.
  //
  // `prefix` and `postfix` mark the operator as a prefix or postfix
  // unary operator.
  //
  // `isAssign` marks all of `=`, `+=`, `-=` etcetera, which act as
  // binary operators with a very low precedence, that should result
  // in AssignmentExpression nodes.
  eq: new TokenType("=", { beforeExpr: true, isAssign: true }),
  assign: new TokenType("_=", { beforeExpr: true, isAssign: true }),
  incDec: new TokenType("++/--", { prefix: true, postfix: true, startsExpr: true }),
  prefix: new TokenType("!/~", { beforeExpr: true, prefix: true, startsExpr: true }),
  logicalOR: binop("||", 1),
  logicalAND: binop("&&", 2),
  bitwiseOR: binop("|", 3),
  bitwiseXOR: binop("^", 4),
  bitwiseAND: binop("&", 5),
  equality: binop("==/!=/===/!==", 6),
  relational: binop("</>/<=/>=", 7),
  bitShift: binop("<</>>/>>>", 8),
  plusMin: new TokenType("+/-", { beforeExpr: true, binop: 9, prefix: true, startsExpr: true }),
  modulo: binop("%", 10),
  star: binop("*", 10),
  slash: binop("/", 10),
  starstar: new TokenType("**", { beforeExpr: true }),
  coalesce: binop("??", 1),
  // Keyword token types.
  _break: kw("break"),
  _case: kw("case", beforeExpr),
  _catch: kw("catch"),
  _continue: kw("continue"),
  _debugger: kw("debugger"),
  _default: kw("default", beforeExpr),
  _do: kw("do", { isLoop: true, beforeExpr: true }),
  _else: kw("else", beforeExpr),
  _finally: kw("finally"),
  _for: kw("for", { isLoop: true }),
  _function: kw("function", startsExpr),
  _if: kw("if"),
  _return: kw("return", beforeExpr),
  _switch: kw("switch"),
  _throw: kw("throw", beforeExpr),
  _try: kw("try"),
  _var: kw("var"),
  _const: kw("const"),
  _while: kw("while", { isLoop: true }),
  _with: kw("with"),
  _new: kw("new", { beforeExpr: true, startsExpr: true }),
  _this: kw("this", startsExpr),
  _super: kw("super", startsExpr),
  _class: kw("class", startsExpr),
  _extends: kw("extends", beforeExpr),
  _export: kw("export"),
  _import: kw("import", startsExpr),
  _null: kw("null", startsExpr),
  _true: kw("true", startsExpr),
  _false: kw("false", startsExpr),
  _in: kw("in", { beforeExpr: true, binop: 7 }),
  _instanceof: kw("instanceof", { beforeExpr: true, binop: 7 }),
  _typeof: kw("typeof", { beforeExpr: true, prefix: true, startsExpr: true }),
  _void: kw("void", { beforeExpr: true, prefix: true, startsExpr: true }),
  _delete: kw("delete", { beforeExpr: true, prefix: true, startsExpr: true })
};
var lineBreak = /\r\n?|\n|\u2028|\u2029/;
var lineBreakG = new RegExp(lineBreak.source, "g");
function isNewLine(code) {
  return code === 10 || code === 13 || code === 8232 || code === 8233;
}
function nextLineBreak(code, from, end) {
  if (end === void 0) end = code.length;
  for (var i2 = from; i2 < end; i2++) {
    var next = code.charCodeAt(i2);
    if (isNewLine(next)) {
      return i2 < end - 1 && next === 13 && code.charCodeAt(i2 + 1) === 10 ? i2 + 2 : i2 + 1;
    }
  }
  return -1;
}
var nonASCIIwhitespace = /[\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]/;
var skipWhiteSpace = /(?:\s|\/\/.*|\/\*[^]*?\*\/)*/g;
var ref = Object.prototype;
var hasOwnProperty = ref.hasOwnProperty;
var toString = ref.toString;
var hasOwn = Object.hasOwn || (function(obj, propName) {
  return hasOwnProperty.call(obj, propName);
});
var isArray = Array.isArray || (function(obj) {
  return toString.call(obj) === "[object Array]";
});
var regexpCache = /* @__PURE__ */ Object.create(null);
function wordsRegexp(words) {
  return regexpCache[words] || (regexpCache[words] = new RegExp("^(?:" + words.replace(/ /g, "|") + ")$"));
}
function codePointToString(code) {
  if (code <= 65535) {
    return String.fromCharCode(code);
  }
  code -= 65536;
  return String.fromCharCode((code >> 10) + 55296, (code & 1023) + 56320);
}
var loneSurrogate = /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF])/;
var Position = function Position2(line2, col) {
  this.line = line2;
  this.column = col;
};
Position.prototype.offset = function offset(n) {
  return new Position(this.line, this.column + n);
};
var SourceLocation = function SourceLocation2(p, start, end) {
  this.start = start;
  this.end = end;
  if (p.sourceFile !== null) {
    this.source = p.sourceFile;
  }
};
function getLineInfo(input, offset2) {
  for (var line2 = 1, cur = 0; ; ) {
    var nextBreak = nextLineBreak(input, cur, offset2);
    if (nextBreak < 0) {
      return new Position(line2, offset2 - cur);
    }
    ++line2;
    cur = nextBreak;
  }
}
var defaultOptions = {
  // `ecmaVersion` indicates the ECMAScript version to parse. Must be
  // either 3, 5, 6 (or 2015), 7 (2016), 8 (2017), 9 (2018), 10
  // (2019), 11 (2020), 12 (2021), 13 (2022), 14 (2023), or `"latest"`
  // (the latest version the library supports). This influences
  // support for strict mode, the set of reserved words, and support
  // for new syntax features.
  ecmaVersion: null,
  // `sourceType` indicates the mode the code should be parsed in.
  // Can be either `"script"`, `"module"` or `"commonjs"`. This influences global
  // strict mode and parsing of `import` and `export` declarations.
  sourceType: "script",
  // When set to true, enable strict parsing mode even if `sourceType`
  // is `"script"`.
  strict: false,
  // `onInsertedSemicolon` can be a callback that will be called when
  // a semicolon is automatically inserted. It will be passed the
  // position of the inserted semicolon as an offset, and if
  // `locations` is enabled, it is given the location as a `{line,
  // column}` object as second argument.
  onInsertedSemicolon: null,
  // `onTrailingComma` is similar to `onInsertedSemicolon`, but for
  // trailing commas.
  onTrailingComma: null,
  // By default, reserved words are only enforced if ecmaVersion >= 5.
  // Set `allowReserved` to a boolean value to explicitly turn this on
  // an off. When this option has the value "never", reserved words
  // and keywords can also not be used as property names.
  allowReserved: null,
  // When enabled, a return at the top level is not considered an
  // error.
  allowReturnOutsideFunction: false,
  // When enabled, import/export statements are not constrained to
  // appearing at the top of the program, and an import.meta expression
  // in a script isn't considered an error.
  allowImportExportEverywhere: false,
  // By default, await identifiers are allowed to appear at the top-level scope only if ecmaVersion >= 2022.
  // When enabled, await identifiers are allowed to appear at the top-level scope,
  // but they are still not allowed in non-async functions.
  allowAwaitOutsideFunction: null,
  // When enabled, super identifiers are not constrained to
  // appearing in methods and do not raise an error when they appear elsewhere.
  allowSuperOutsideMethod: null,
  // When enabled, hashbang directive in the beginning of file is
  // allowed and treated as a line comment. Enabled by default when
  // `ecmaVersion` >= 2023.
  allowHashBang: false,
  // By default, the parser will verify that private properties are
  // only used in places where they are valid and have been declared.
  // Set this to false to turn such checks off.
  checkPrivateFields: true,
  // When `locations` is on, `loc` properties holding objects with
  // `start` and `end` properties in `{line, column}` form (with
  // line being 1-based and column 0-based) will be attached to the
  // nodes.
  locations: false,
  // A function can be passed as `onToken` option, which will
  // cause Acorn to call that function with object in the same
  // format as tokens returned from `tokenizer().getToken()`. Note
  // that you are not allowed to call the parser from the
  // callback—that will corrupt its internal state.
  onToken: null,
  // A function can be passed as `onComment` option, which will
  // cause Acorn to call that function with `(block, text, start,
  // end)` parameters whenever a comment is skipped. `block` is a
  // boolean indicating whether this is a block (`/* */`) comment,
  // `text` is the content of the comment, and `start` and `end` are
  // character offsets that denote the start and end of the comment.
  // When the `locations` option is on, two more parameters are
  // passed, the full `{line, column}` locations of the start and
  // end of the comments. Note that you are not allowed to call the
  // parser from the callback—that will corrupt its internal state.
  // When this option has an array as value, objects representing the
  // comments are pushed to it.
  onComment: null,
  // Nodes have their start and end characters offsets recorded in
  // `start` and `end` properties (directly on the node, rather than
  // the `loc` object, which holds line/column data. To also add a
  // [semi-standardized][range] `range` property holding a `[start,
  // end]` array with the same numbers, set the `ranges` option to
  // `true`.
  //
  // [range]: https://bugzilla.mozilla.org/show_bug.cgi?id=745678
  ranges: false,
  // It is possible to parse multiple files into a single AST by
  // passing the tree produced by parsing the first file as
  // `program` option in subsequent parses. This will add the
  // toplevel forms of the parsed file to the `Program` (top) node
  // of an existing parse tree.
  program: null,
  // When `locations` is on, you can pass this to record the source
  // file in every node's `loc` object.
  sourceFile: null,
  // This value, if given, is stored in every node, whether
  // `locations` is on or off.
  directSourceFile: null,
  // When enabled, parenthesized expressions are represented by
  // (non-standard) ParenthesizedExpression nodes
  preserveParens: false
};
var warnedAboutEcmaVersion = false;
function getOptions(opts) {
  var options = {};
  for (var opt in defaultOptions) {
    options[opt] = opts && hasOwn(opts, opt) ? opts[opt] : defaultOptions[opt];
  }
  if (options.ecmaVersion === "latest") {
    options.ecmaVersion = 1e8;
  } else if (options.ecmaVersion == null) {
    if (!warnedAboutEcmaVersion && typeof console === "object" && console.warn) {
      warnedAboutEcmaVersion = true;
      console.warn("Since Acorn 8.0.0, options.ecmaVersion is required.\nDefaulting to 2020, but this will stop working in the future.");
    }
    options.ecmaVersion = 11;
  } else if (options.ecmaVersion >= 2015) {
    options.ecmaVersion -= 2009;
  }
  if (options.allowReserved == null) {
    options.allowReserved = options.ecmaVersion < 5;
  }
  if (!opts || opts.allowHashBang == null) {
    options.allowHashBang = options.ecmaVersion >= 14;
  }
  if (isArray(options.onToken)) {
    var tokens = options.onToken;
    options.onToken = function(token) {
      return tokens.push(token);
    };
  }
  if (isArray(options.onComment)) {
    options.onComment = pushComment(options, options.onComment);
  }
  if (options.sourceType === "commonjs" && options.allowAwaitOutsideFunction) {
    throw new Error("Cannot use allowAwaitOutsideFunction with sourceType: commonjs");
  }
  return options;
}
function pushComment(options, array) {
  return function(block, text, start, end, startLoc, endLoc) {
    var comment = {
      type: block ? "Block" : "Line",
      value: text,
      start,
      end
    };
    if (options.locations) {
      comment.loc = new SourceLocation(this, startLoc, endLoc);
    }
    if (options.ranges) {
      comment.range = [start, end];
    }
    array.push(comment);
  };
}
var SCOPE_TOP = 1;
var SCOPE_FUNCTION = 2;
var SCOPE_ASYNC = 4;
var SCOPE_GENERATOR = 8;
var SCOPE_ARROW = 16;
var SCOPE_SIMPLE_CATCH = 32;
var SCOPE_SUPER = 64;
var SCOPE_DIRECT_SUPER = 128;
var SCOPE_CLASS_STATIC_BLOCK = 256;
var SCOPE_CLASS_FIELD_INIT = 512;
var SCOPE_SWITCH = 1024;
var SCOPE_VAR = SCOPE_TOP | SCOPE_FUNCTION | SCOPE_CLASS_STATIC_BLOCK;
function functionFlags(async, generator) {
  return SCOPE_FUNCTION | (async ? SCOPE_ASYNC : 0) | (generator ? SCOPE_GENERATOR : 0);
}
var BIND_NONE = 0;
var BIND_VAR = 1;
var BIND_LEXICAL = 2;
var BIND_FUNCTION = 3;
var BIND_SIMPLE_CATCH = 4;
var BIND_OUTSIDE = 5;
var Parser = function Parser2(options, input, startPos) {
  this.options = options = getOptions(options);
  this.sourceFile = options.sourceFile;
  this.keywords = wordsRegexp(keywords$1[options.ecmaVersion >= 6 ? 6 : options.sourceType === "module" ? "5module" : 5]);
  var reserved = "";
  if (options.allowReserved !== true) {
    reserved = reservedWords[options.ecmaVersion >= 6 ? 6 : options.ecmaVersion === 5 ? 5 : 3];
    if (options.sourceType === "module") {
      reserved += " await";
    }
  }
  this.reservedWords = wordsRegexp(reserved);
  var reservedStrict = (reserved ? reserved + " " : "") + reservedWords.strict;
  this.reservedWordsStrict = wordsRegexp(reservedStrict);
  this.reservedWordsStrictBind = wordsRegexp(reservedStrict + " " + reservedWords.strictBind);
  this.input = String(input);
  this.containsEsc = false;
  if (startPos) {
    this.pos = startPos;
    this.lineStart = this.input.lastIndexOf("\n", startPos - 1) + 1;
    this.curLine = this.input.slice(0, this.lineStart).split(lineBreak).length;
  } else {
    this.pos = this.lineStart = 0;
    this.curLine = 1;
  }
  this.type = types$1.eof;
  this.value = null;
  this.start = this.end = this.pos;
  this.startLoc = this.endLoc = this.curPosition();
  this.lastTokEndLoc = this.lastTokStartLoc = null;
  this.lastTokStart = this.lastTokEnd = this.pos;
  this.context = this.initialContext();
  this.exprAllowed = true;
  this.inModule = options.sourceType === "module";
  this.strict = this.inModule || options.strict === true || this.strictDirective(this.pos);
  this.potentialArrowAt = -1;
  this.potentialArrowInForAwait = false;
  this.yieldPos = this.awaitPos = this.awaitIdentPos = 0;
  this.labels = [];
  this.undefinedExports = /* @__PURE__ */ Object.create(null);
  if (this.pos === 0 && options.allowHashBang && this.input.slice(0, 2) === "#!") {
    this.skipLineComment(2);
  }
  this.scopeStack = [];
  this.enterScope(
    this.options.sourceType === "commonjs" ? SCOPE_FUNCTION : SCOPE_TOP
  );
  this.regexpState = null;
  this.privateNameStack = [];
};
var prototypeAccessors = { inFunction: { configurable: true }, inGenerator: { configurable: true }, inAsync: { configurable: true }, canAwait: { configurable: true }, allowReturn: { configurable: true }, allowSuper: { configurable: true }, allowDirectSuper: { configurable: true }, treatFunctionsAsVar: { configurable: true }, allowNewDotTarget: { configurable: true }, allowUsing: { configurable: true }, inClassStaticBlock: { configurable: true } };
Parser.prototype.parse = function parse() {
  var this$1$1 = this;
  var node2 = this.options.program || this.startNode();
  this.nextToken();
  return this.catchStackOverflow(function() {
    return this$1$1.parseTopLevel(node2);
  });
};
prototypeAccessors.inFunction.get = function() {
  return (this.currentVarScope().flags & SCOPE_FUNCTION) > 0;
};
prototypeAccessors.inGenerator.get = function() {
  return (this.currentVarScope().flags & SCOPE_GENERATOR) > 0;
};
prototypeAccessors.inAsync.get = function() {
  return (this.currentVarScope().flags & SCOPE_ASYNC) > 0;
};
prototypeAccessors.canAwait.get = function() {
  for (var i2 = this.scopeStack.length - 1; i2 >= 0; i2--) {
    var ref2 = this.scopeStack[i2];
    var flags = ref2.flags;
    if (flags & (SCOPE_CLASS_STATIC_BLOCK | SCOPE_CLASS_FIELD_INIT)) {
      return false;
    }
    if (flags & SCOPE_FUNCTION) {
      return (flags & SCOPE_ASYNC) > 0;
    }
  }
  return this.inModule && this.options.ecmaVersion >= 13 || this.options.allowAwaitOutsideFunction;
};
prototypeAccessors.allowReturn.get = function() {
  if (this.inFunction) {
    return true;
  }
  if (this.options.allowReturnOutsideFunction && this.currentVarScope().flags & SCOPE_TOP) {
    return true;
  }
  return false;
};
prototypeAccessors.allowSuper.get = function() {
  var ref2 = this.currentThisScope();
  var flags = ref2.flags;
  return (flags & SCOPE_SUPER) > 0 || this.options.allowSuperOutsideMethod;
};
prototypeAccessors.allowDirectSuper.get = function() {
  return (this.currentThisScope().flags & SCOPE_DIRECT_SUPER) > 0;
};
prototypeAccessors.treatFunctionsAsVar.get = function() {
  return this.treatFunctionsAsVarInScope(this.currentScope());
};
prototypeAccessors.allowNewDotTarget.get = function() {
  for (var i2 = this.scopeStack.length - 1; i2 >= 0; i2--) {
    var ref2 = this.scopeStack[i2];
    var flags = ref2.flags;
    if (flags & (SCOPE_CLASS_STATIC_BLOCK | SCOPE_CLASS_FIELD_INIT) || flags & SCOPE_FUNCTION && !(flags & SCOPE_ARROW)) {
      return true;
    }
  }
  return false;
};
prototypeAccessors.allowUsing.get = function() {
  var ref2 = this.currentScope();
  var flags = ref2.flags;
  if (flags & SCOPE_SWITCH) {
    return false;
  }
  if (!this.inModule && flags & SCOPE_TOP) {
    return false;
  }
  return true;
};
prototypeAccessors.inClassStaticBlock.get = function() {
  return (this.currentVarScope().flags & SCOPE_CLASS_STATIC_BLOCK) > 0;
};
Parser.extend = function extend() {
  var plugins = [], len = arguments.length;
  while (len--) plugins[len] = arguments[len];
  var cls = this;
  for (var i2 = 0; i2 < plugins.length; i2++) {
    cls = plugins[i2](cls);
  }
  return cls;
};
Parser.parse = function parse2(input, options) {
  return new this(options, input).parse();
};
Parser.parseExpressionAt = function parseExpressionAt(input, pos, options) {
  var parser = new this(options, input, pos);
  parser.nextToken();
  return parser.parseExpression();
};
Parser.tokenizer = function tokenizer(input, options) {
  return new this(options, input);
};
Object.defineProperties(Parser.prototype, prototypeAccessors);
var pp$9 = Parser.prototype;
var literal = /^(?:'((?:\\[^]|[^'\\])*?)'|"((?:\\[^]|[^"\\])*?)")/;
pp$9.strictDirective = function(start) {
  if (this.options.ecmaVersion < 5) {
    return false;
  }
  for (; ; ) {
    skipWhiteSpace.lastIndex = start;
    start += skipWhiteSpace.exec(this.input)[0].length;
    var match = literal.exec(this.input.slice(start));
    if (!match) {
      return false;
    }
    if ((match[1] || match[2]) === "use strict") {
      skipWhiteSpace.lastIndex = start + match[0].length;
      var spaceAfter = skipWhiteSpace.exec(this.input), end = spaceAfter.index + spaceAfter[0].length;
      var next = this.input.charAt(end);
      return next === ";" || next === "}" || lineBreak.test(spaceAfter[0]) && !(/[(`.[+\-/*%<>=,?^&]/.test(next) || next === "!" && this.input.charAt(end + 1) === "=");
    }
    start += match[0].length;
    skipWhiteSpace.lastIndex = start;
    start += skipWhiteSpace.exec(this.input)[0].length;
    if (this.input[start] === ";") {
      start++;
    }
  }
};
pp$9.eat = function(type) {
  if (this.type === type) {
    this.next();
    return true;
  } else {
    return false;
  }
};
pp$9.isContextual = function(name) {
  return this.type === types$1.name && this.value === name && !this.containsEsc;
};
pp$9.eatContextual = function(name) {
  if (!this.isContextual(name)) {
    return false;
  }
  this.next();
  return true;
};
pp$9.catchStackOverflow = function(f) {
  try {
    return f();
  } catch (e) {
    if (e instanceof Error && (/\bstack\b.*\b(exceeded|overflow)\b/i.test(e.message) || /\btoo much recursion\b/i.test(e.message))) {
      this.raise(this.start, "Not enough stack space to parse input");
    } else {
      throw e;
    }
  }
};
pp$9.expectContextual = function(name) {
  if (!this.eatContextual(name)) {
    this.unexpected();
  }
};
pp$9.canInsertSemicolon = function() {
  return this.type === types$1.eof || this.type === types$1.braceR || lineBreak.test(this.input.slice(this.lastTokEnd, this.start));
};
pp$9.insertSemicolon = function() {
  if (this.canInsertSemicolon()) {
    if (this.options.onInsertedSemicolon) {
      this.options.onInsertedSemicolon(this.lastTokEnd, this.lastTokEndLoc);
    }
    return true;
  }
};
pp$9.semicolon = function() {
  if (!this.eat(types$1.semi) && !this.insertSemicolon()) {
    this.unexpected();
  }
};
pp$9.afterTrailingComma = function(tokType, notNext) {
  if (this.type === tokType) {
    if (this.options.onTrailingComma) {
      this.options.onTrailingComma(this.lastTokStart, this.lastTokStartLoc);
    }
    if (!notNext) {
      this.next();
    }
    return true;
  }
};
pp$9.expect = function(type) {
  this.eat(type) || this.unexpected();
};
pp$9.unexpected = function(pos) {
  this.raise(pos != null ? pos : this.start, "Unexpected token");
};
var DestructuringErrors = function DestructuringErrors2() {
  this.shorthandAssign = this.trailingComma = this.parenthesizedAssign = this.parenthesizedBind = this.doubleProto = -1;
};
pp$9.checkPatternErrors = function(refDestructuringErrors, isAssign) {
  if (!refDestructuringErrors) {
    return;
  }
  if (refDestructuringErrors.trailingComma > -1) {
    this.raiseRecoverable(refDestructuringErrors.trailingComma, "Comma is not permitted after the rest element");
  }
  var parens = isAssign ? refDestructuringErrors.parenthesizedAssign : refDestructuringErrors.parenthesizedBind;
  if (parens > -1) {
    this.raiseRecoverable(parens, isAssign ? "Assigning to rvalue" : "Parenthesized pattern");
  }
};
pp$9.checkExpressionErrors = function(refDestructuringErrors, andThrow) {
  if (!refDestructuringErrors) {
    return false;
  }
  var shorthandAssign = refDestructuringErrors.shorthandAssign;
  var doubleProto = refDestructuringErrors.doubleProto;
  if (!andThrow) {
    return shorthandAssign >= 0 || doubleProto >= 0;
  }
  if (shorthandAssign >= 0) {
    this.raise(shorthandAssign, "Shorthand property assignments are valid only in destructuring patterns");
  }
  if (doubleProto >= 0) {
    this.raiseRecoverable(doubleProto, "Redefinition of __proto__ property");
  }
};
pp$9.checkYieldAwaitInDefaultParams = function() {
  if (this.yieldPos && (!this.awaitPos || this.yieldPos < this.awaitPos)) {
    this.raise(this.yieldPos, "Yield expression cannot be a default value");
  }
  if (this.awaitPos) {
    this.raise(this.awaitPos, "Await expression cannot be a default value");
  }
};
pp$9.isSimpleAssignTarget = function(expr) {
  if (expr.type === "ParenthesizedExpression") {
    return this.isSimpleAssignTarget(expr.expression);
  }
  return expr.type === "Identifier" || expr.type === "MemberExpression";
};
var pp$8 = Parser.prototype;
pp$8.parseTopLevel = function(node2) {
  var exports$1 = /* @__PURE__ */ Object.create(null);
  if (!node2.body) {
    node2.body = [];
  }
  while (this.type !== types$1.eof) {
    var stmt = this.parseStatement(null, true, exports$1);
    node2.body.push(stmt);
  }
  if (this.inModule) {
    for (var i2 = 0, list2 = Object.keys(this.undefinedExports); i2 < list2.length; i2 += 1) {
      var name = list2[i2];
      this.raiseRecoverable(this.undefinedExports[name].start, "Export '" + name + "' is not defined");
    }
  }
  this.adaptDirectivePrologue(node2.body);
  this.next();
  node2.sourceType = this.options.sourceType === "commonjs" ? "script" : this.options.sourceType;
  return this.finishNode(node2, "Program");
};
var loopLabel = { kind: "loop" };
var switchLabel = { kind: "switch" };
pp$8.isLet = function(context) {
  if (this.options.ecmaVersion < 6 || !this.isContextual("let")) {
    return false;
  }
  skipWhiteSpace.lastIndex = this.pos;
  var skip = skipWhiteSpace.exec(this.input);
  var next = this.pos + skip[0].length, nextCh = this.fullCharCodeAt(next);
  if (nextCh === 91 || nextCh === 92) {
    return true;
  }
  if (context) {
    return false;
  }
  if (nextCh === 123) {
    return true;
  }
  if (isIdentifierStart(nextCh)) {
    var start = next;
    do {
      next += nextCh <= 65535 ? 1 : 2;
    } while (isIdentifierChar(nextCh = this.fullCharCodeAt(next)));
    if (nextCh === 92) {
      return true;
    }
    var ident = this.input.slice(start, next);
    if (!keywordRelationalOperator.test(ident)) {
      return true;
    }
  }
  return false;
};
pp$8.isAsyncFunction = function() {
  if (this.options.ecmaVersion < 8 || !this.isContextual("async")) {
    return false;
  }
  skipWhiteSpace.lastIndex = this.pos;
  var skip = skipWhiteSpace.exec(this.input);
  var next = this.pos + skip[0].length, after;
  return !lineBreak.test(this.input.slice(this.pos, next)) && this.input.slice(next, next + 8) === "function" && (next + 8 === this.input.length || !(isIdentifierChar(after = this.fullCharCodeAt(next + 8)) || after === 92));
};
pp$8.isUsingKeyword = function(isAwaitUsing, isFor) {
  if (this.options.ecmaVersion < 17 || !this.isContextual(isAwaitUsing ? "await" : "using")) {
    return false;
  }
  skipWhiteSpace.lastIndex = this.pos;
  var skip = skipWhiteSpace.exec(this.input);
  var next = this.pos + skip[0].length;
  if (lineBreak.test(this.input.slice(this.pos, next))) {
    return false;
  }
  if (isAwaitUsing) {
    var usingEndPos = next + 5, after;
    if (this.input.slice(next, usingEndPos) !== "using" || usingEndPos === this.input.length || isIdentifierChar(after = this.fullCharCodeAt(usingEndPos)) || after === 92) {
      return false;
    }
    skipWhiteSpace.lastIndex = usingEndPos;
    var skipAfterUsing = skipWhiteSpace.exec(this.input);
    next = usingEndPos + skipAfterUsing[0].length;
    if (skipAfterUsing && lineBreak.test(this.input.slice(usingEndPos, next))) {
      return false;
    }
  }
  var ch = this.fullCharCodeAt(next);
  if (!isIdentifierStart(ch) && ch !== 92) {
    return false;
  }
  var idStart = next;
  do {
    next += ch <= 65535 ? 1 : 2;
  } while (isIdentifierChar(ch = this.fullCharCodeAt(next)));
  if (ch === 92) {
    return true;
  }
  var id = this.input.slice(idStart, next);
  if (keywordRelationalOperator.test(id)) {
    return false;
  }
  if (isFor && !isAwaitUsing && id === "of") {
    skipWhiteSpace.lastIndex = next;
    var skipAfterOf = skipWhiteSpace.exec(this.input);
    next = next + skipAfterOf[0].length;
    if (this.input.charCodeAt(next) !== 61 || // Check for ==, === and => operators
    (ch = this.input.charCodeAt(next + 1)) === 61 || ch === 62) {
      return false;
    }
  }
  return true;
};
pp$8.isAwaitUsing = function(isFor) {
  return this.isUsingKeyword(true, isFor);
};
pp$8.isUsing = function(isFor) {
  return this.isUsingKeyword(false, isFor);
};
pp$8.parseStatement = function(context, topLevel, exports$1) {
  var starttype = this.type, node2 = this.startNode(), kind;
  if (this.isLet(context)) {
    starttype = types$1._var;
    kind = "let";
  }
  switch (starttype) {
    case types$1._break:
    case types$1._continue:
      return this.parseBreakContinueStatement(node2, starttype.keyword);
    case types$1._debugger:
      return this.parseDebuggerStatement(node2);
    case types$1._do:
      return this.parseDoStatement(node2);
    case types$1._for:
      return this.parseForStatement(node2);
    case types$1._function:
      if (context && (this.strict || context !== "if" && context !== "label") && this.options.ecmaVersion >= 6) {
        this.unexpected();
      }
      return this.parseFunctionStatement(node2, false, !context);
    case types$1._class:
      if (context) {
        this.unexpected();
      }
      return this.parseClass(node2, true);
    case types$1._if:
      return this.parseIfStatement(node2);
    case types$1._return:
      return this.parseReturnStatement(node2);
    case types$1._switch:
      return this.parseSwitchStatement(node2);
    case types$1._throw:
      return this.parseThrowStatement(node2);
    case types$1._try:
      return this.parseTryStatement(node2);
    case types$1._const:
    case types$1._var:
      kind = kind || this.value;
      if (context && kind !== "var") {
        this.unexpected();
      }
      return this.parseVarStatement(node2, kind);
    case types$1._while:
      return this.parseWhileStatement(node2);
    case types$1._with:
      return this.parseWithStatement(node2);
    case types$1.braceL:
      return this.parseBlock(true, node2);
    case types$1.semi:
      return this.parseEmptyStatement(node2);
    case types$1._export:
    case types$1._import:
      if (this.options.ecmaVersion > 10 && starttype === types$1._import) {
        skipWhiteSpace.lastIndex = this.pos;
        var skip = skipWhiteSpace.exec(this.input);
        var next = this.pos + skip[0].length, nextCh = this.input.charCodeAt(next);
        if (nextCh === 40 || nextCh === 46) {
          return this.parseExpressionStatement(node2, this.parseExpression());
        }
      }
      if (!this.options.allowImportExportEverywhere) {
        if (!topLevel) {
          this.raise(this.start, "'import' and 'export' may only appear at the top level");
        }
        if (!this.inModule) {
          this.raise(this.start, "'import' and 'export' may appear only with 'sourceType: module'");
        }
      }
      return starttype === types$1._import ? this.parseImport(node2) : this.parseExport(node2, exports$1);
    // If the statement does not start with a statement keyword or a
    // brace, it's an ExpressionStatement or LabeledStatement. We
    // simply start parsing an expression, and afterwards, if the
    // next token is a colon and the expression was a simple
    // Identifier node, we switch to interpreting it as a label.
    default:
      if (this.isAsyncFunction()) {
        if (context) {
          this.unexpected();
        }
        this.next();
        return this.parseFunctionStatement(node2, true, !context);
      }
      var usingKind = this.isAwaitUsing(false) ? "await using" : this.isUsing(false) ? "using" : null;
      if (usingKind) {
        if (!this.allowUsing) {
          this.raise(this.start, "Using declaration cannot appear in the top level when source type is `script` or in the bare case statement");
        }
        if (context) {
          this.raise(this.start, "Using declaration is not allowed in single-statement positions");
        }
        if (usingKind === "await using") {
          if (!this.canAwait) {
            this.raise(this.start, "Await using cannot appear outside of async function");
          }
          this.next();
        }
        this.next();
        this.parseVar(node2, false, usingKind);
        this.semicolon();
        return this.finishNode(node2, "VariableDeclaration");
      }
      var maybeName = this.value, expr = this.parseExpression();
      if (starttype === types$1.name && expr.type === "Identifier" && this.eat(types$1.colon)) {
        return this.parseLabeledStatement(node2, maybeName, expr, context);
      } else {
        return this.parseExpressionStatement(node2, expr);
      }
  }
};
pp$8.parseBreakContinueStatement = function(node2, keyword) {
  var isBreak = keyword === "break";
  this.next();
  if (this.eat(types$1.semi) || this.insertSemicolon()) {
    node2.label = null;
  } else if (this.type !== types$1.name) {
    this.unexpected();
  } else {
    node2.label = this.parseIdent();
    this.semicolon();
  }
  var i2 = 0;
  for (; i2 < this.labels.length; ++i2) {
    var lab = this.labels[i2];
    if (node2.label == null || lab.name === node2.label.name) {
      if (lab.kind != null && (isBreak || lab.kind === "loop")) {
        break;
      }
      if (node2.label && isBreak) {
        break;
      }
    }
  }
  if (i2 === this.labels.length) {
    this.raise(node2.start, "Unsyntactic " + keyword);
  }
  return this.finishNode(node2, isBreak ? "BreakStatement" : "ContinueStatement");
};
pp$8.parseDebuggerStatement = function(node2) {
  this.next();
  this.semicolon();
  return this.finishNode(node2, "DebuggerStatement");
};
pp$8.parseDoStatement = function(node2) {
  this.next();
  this.labels.push(loopLabel);
  node2.body = this.parseStatement("do");
  this.labels.pop();
  this.expect(types$1._while);
  node2.test = this.parseParenExpression();
  if (this.options.ecmaVersion >= 6) {
    this.eat(types$1.semi);
  } else {
    this.semicolon();
  }
  return this.finishNode(node2, "DoWhileStatement");
};
pp$8.parseForStatement = function(node2) {
  this.next();
  var awaitAt = this.options.ecmaVersion >= 9 && this.canAwait && this.eatContextual("await") ? this.lastTokStart : -1;
  this.labels.push(loopLabel);
  this.enterScope(0);
  this.expect(types$1.parenL);
  if (this.type === types$1.semi) {
    if (awaitAt > -1) {
      this.unexpected(awaitAt);
    }
    return this.parseFor(node2, null);
  }
  var isLet = this.isLet();
  if (this.type === types$1._var || this.type === types$1._const || isLet) {
    var init$1 = this.startNode(), kind = isLet ? "let" : this.value;
    this.next();
    this.parseVar(init$1, true, kind);
    this.finishNode(init$1, "VariableDeclaration");
    return this.parseForAfterInit(node2, init$1, awaitAt);
  }
  var startsWithLet = this.isContextual("let"), isForOf = false;
  var usingKind = this.isUsing(true) ? "using" : this.isAwaitUsing(true) ? "await using" : null;
  if (usingKind) {
    var init$2 = this.startNode();
    this.next();
    if (usingKind === "await using") {
      if (!this.canAwait) {
        this.raise(this.start, "Await using cannot appear outside of async function");
      }
      this.next();
    }
    this.parseVar(init$2, true, usingKind);
    this.finishNode(init$2, "VariableDeclaration");
    return this.parseForAfterInit(node2, init$2, awaitAt);
  }
  var containsEsc = this.containsEsc;
  var refDestructuringErrors = new DestructuringErrors();
  var initPos = this.start;
  var init = awaitAt > -1 ? this.parseExprSubscripts(refDestructuringErrors, "await") : this.parseExpression(true, refDestructuringErrors);
  if (this.type === types$1._in || (isForOf = this.options.ecmaVersion >= 6 && this.isContextual("of"))) {
    if (awaitAt > -1) {
      if (this.type === types$1._in) {
        this.unexpected(awaitAt);
      }
      node2.await = true;
    } else if (isForOf && this.options.ecmaVersion >= 8) {
      if (init.start === initPos && !containsEsc && init.type === "Identifier" && init.name === "async") {
        this.unexpected();
      } else if (this.options.ecmaVersion >= 9) {
        node2.await = false;
      }
    }
    if (startsWithLet && isForOf) {
      this.raise(init.start, "The left-hand side of a for-of loop may not start with 'let'.");
    }
    this.toAssignable(init, false, refDestructuringErrors);
    this.checkLValPattern(init);
    return this.parseForIn(node2, init);
  } else {
    this.checkExpressionErrors(refDestructuringErrors, true);
  }
  if (awaitAt > -1) {
    this.unexpected(awaitAt);
  }
  return this.parseFor(node2, init);
};
pp$8.parseForAfterInit = function(node2, init, awaitAt) {
  if ((this.type === types$1._in || this.options.ecmaVersion >= 6 && this.isContextual("of")) && init.declarations.length === 1) {
    if (this.type === types$1._in) {
      if ((init.kind === "using" || init.kind === "await using") && !init.declarations[0].init) {
        this.raise(this.start, "Using declaration is not allowed in for-in loops");
      }
      if (this.options.ecmaVersion >= 9 && awaitAt > -1) {
        this.unexpected(awaitAt);
      }
    } else if (this.options.ecmaVersion >= 9) {
      node2.await = awaitAt > -1;
    }
    return this.parseForIn(node2, init);
  }
  if (awaitAt > -1) {
    this.unexpected(awaitAt);
  }
  return this.parseFor(node2, init);
};
pp$8.parseFunctionStatement = function(node2, isAsync, declarationPosition) {
  this.next();
  return this.parseFunction(node2, FUNC_STATEMENT | (declarationPosition ? 0 : FUNC_HANGING_STATEMENT), false, isAsync);
};
pp$8.parseIfStatement = function(node2) {
  this.next();
  node2.test = this.parseParenExpression();
  node2.consequent = this.parseStatement("if");
  node2.alternate = this.eat(types$1._else) ? this.parseStatement("if") : null;
  return this.finishNode(node2, "IfStatement");
};
pp$8.parseReturnStatement = function(node2) {
  if (!this.allowReturn) {
    this.raise(this.start, "'return' outside of function");
  }
  this.next();
  if (this.eat(types$1.semi) || this.insertSemicolon()) {
    node2.argument = null;
  } else {
    node2.argument = this.parseExpression();
    this.semicolon();
  }
  return this.finishNode(node2, "ReturnStatement");
};
pp$8.parseSwitchStatement = function(node2) {
  this.next();
  node2.discriminant = this.parseParenExpression();
  node2.cases = [];
  this.expect(types$1.braceL);
  this.labels.push(switchLabel);
  this.enterScope(SCOPE_SWITCH);
  var cur;
  for (var sawDefault = false; this.type !== types$1.braceR; ) {
    if (this.type === types$1._case || this.type === types$1._default) {
      var isCase = this.type === types$1._case;
      if (cur) {
        this.finishNode(cur, "SwitchCase");
      }
      node2.cases.push(cur = this.startNode());
      cur.consequent = [];
      this.next();
      if (isCase) {
        cur.test = this.parseExpression();
      } else {
        if (sawDefault) {
          this.raiseRecoverable(this.lastTokStart, "Multiple default clauses");
        }
        sawDefault = true;
        cur.test = null;
      }
      this.expect(types$1.colon);
    } else {
      if (!cur) {
        this.unexpected();
      }
      cur.consequent.push(this.parseStatement(null));
    }
  }
  this.exitScope();
  if (cur) {
    this.finishNode(cur, "SwitchCase");
  }
  this.next();
  this.labels.pop();
  return this.finishNode(node2, "SwitchStatement");
};
pp$8.parseThrowStatement = function(node2) {
  this.next();
  if (lineBreak.test(this.input.slice(this.lastTokEnd, this.start))) {
    this.raise(this.lastTokEnd, "Illegal newline after throw");
  }
  node2.argument = this.parseExpression();
  this.semicolon();
  return this.finishNode(node2, "ThrowStatement");
};
var empty$1 = [];
pp$8.parseCatchClauseParam = function() {
  var param = this.parseBindingAtom();
  var simple = param.type === "Identifier";
  this.enterScope(simple ? SCOPE_SIMPLE_CATCH : 0);
  this.checkLValPattern(param, simple ? BIND_SIMPLE_CATCH : BIND_LEXICAL);
  this.expect(types$1.parenR);
  return param;
};
pp$8.parseTryStatement = function(node2) {
  this.next();
  node2.block = this.parseBlock();
  node2.handler = null;
  if (this.type === types$1._catch) {
    var clause = this.startNode();
    this.next();
    if (this.eat(types$1.parenL)) {
      clause.param = this.parseCatchClauseParam();
    } else {
      if (this.options.ecmaVersion < 10) {
        this.unexpected();
      }
      clause.param = null;
      this.enterScope(0);
    }
    clause.body = this.parseBlock(false);
    this.exitScope();
    node2.handler = this.finishNode(clause, "CatchClause");
  }
  node2.finalizer = this.eat(types$1._finally) ? this.parseBlock() : null;
  if (!node2.handler && !node2.finalizer) {
    this.raise(node2.start, "Missing catch or finally clause");
  }
  return this.finishNode(node2, "TryStatement");
};
pp$8.parseVarStatement = function(node2, kind, allowMissingInitializer) {
  this.next();
  this.parseVar(node2, false, kind, allowMissingInitializer);
  this.semicolon();
  return this.finishNode(node2, "VariableDeclaration");
};
pp$8.parseWhileStatement = function(node2) {
  this.next();
  node2.test = this.parseParenExpression();
  this.labels.push(loopLabel);
  node2.body = this.parseStatement("while");
  this.labels.pop();
  return this.finishNode(node2, "WhileStatement");
};
pp$8.parseWithStatement = function(node2) {
  if (this.strict) {
    this.raise(this.start, "'with' in strict mode");
  }
  this.next();
  node2.object = this.parseParenExpression();
  node2.body = this.parseStatement("with");
  return this.finishNode(node2, "WithStatement");
};
pp$8.parseEmptyStatement = function(node2) {
  this.next();
  return this.finishNode(node2, "EmptyStatement");
};
pp$8.parseLabeledStatement = function(node2, maybeName, expr, context) {
  for (var i$1 = 0, list2 = this.labels; i$1 < list2.length; i$1 += 1) {
    var label = list2[i$1];
    if (label.name === maybeName) {
      this.raise(expr.start, "Label '" + maybeName + "' is already declared");
    }
  }
  var kind = this.type.isLoop ? "loop" : this.type === types$1._switch ? "switch" : null;
  for (var i2 = this.labels.length - 1; i2 >= 0; i2--) {
    var label$1 = this.labels[i2];
    if (label$1.statementStart === node2.start) {
      label$1.statementStart = this.start;
      label$1.kind = kind;
    } else {
      break;
    }
  }
  this.labels.push({ name: maybeName, kind, statementStart: this.start });
  node2.body = this.parseStatement(context ? context.indexOf("label") === -1 ? context + "label" : context : "label");
  this.labels.pop();
  node2.label = expr;
  return this.finishNode(node2, "LabeledStatement");
};
pp$8.parseExpressionStatement = function(node2, expr) {
  node2.expression = expr;
  this.semicolon();
  return this.finishNode(node2, "ExpressionStatement");
};
pp$8.parseBlock = function(createNewLexicalScope, node2, exitStrict) {
  if (createNewLexicalScope === void 0) createNewLexicalScope = true;
  if (node2 === void 0) node2 = this.startNode();
  node2.body = [];
  this.expect(types$1.braceL);
  if (createNewLexicalScope) {
    this.enterScope(0);
  }
  while (this.type !== types$1.braceR) {
    var stmt = this.parseStatement(null);
    node2.body.push(stmt);
  }
  if (exitStrict) {
    this.strict = false;
  }
  this.next();
  if (createNewLexicalScope) {
    this.exitScope();
  }
  return this.finishNode(node2, "BlockStatement");
};
pp$8.parseFor = function(node2, init) {
  node2.init = init;
  this.expect(types$1.semi);
  node2.test = this.type === types$1.semi ? null : this.parseExpression();
  this.expect(types$1.semi);
  node2.update = this.type === types$1.parenR ? null : this.parseExpression();
  this.expect(types$1.parenR);
  node2.body = this.parseStatement("for");
  this.exitScope();
  this.labels.pop();
  return this.finishNode(node2, "ForStatement");
};
pp$8.parseForIn = function(node2, init) {
  var isForIn = this.type === types$1._in;
  this.next();
  if (init.type === "VariableDeclaration" && init.declarations[0].init != null && (!isForIn || this.options.ecmaVersion < 8 || this.strict || init.kind !== "var" || init.declarations[0].id.type !== "Identifier")) {
    this.raise(
      init.start,
      (isForIn ? "for-in" : "for-of") + " loop variable declaration may not have an initializer"
    );
  }
  node2.left = init;
  node2.right = isForIn ? this.parseExpression() : this.parseMaybeAssign();
  this.expect(types$1.parenR);
  node2.body = this.parseStatement("for");
  this.exitScope();
  this.labels.pop();
  return this.finishNode(node2, isForIn ? "ForInStatement" : "ForOfStatement");
};
pp$8.parseVar = function(node2, isFor, kind, allowMissingInitializer) {
  node2.declarations = [];
  node2.kind = kind;
  for (; ; ) {
    var decl = this.startNode();
    this.parseVarId(decl, kind);
    if (this.eat(types$1.eq)) {
      decl.init = this.parseMaybeAssign(isFor);
    } else if (!allowMissingInitializer && kind === "const" && !(this.type === types$1._in || this.options.ecmaVersion >= 6 && this.isContextual("of"))) {
      this.unexpected();
    } else if (!allowMissingInitializer && (kind === "using" || kind === "await using") && this.options.ecmaVersion >= 17 && this.type !== types$1._in && !this.isContextual("of")) {
      this.raise(this.lastTokEnd, "Missing initializer in " + kind + " declaration");
    } else if (!allowMissingInitializer && decl.id.type !== "Identifier" && !(isFor && (this.type === types$1._in || this.isContextual("of")))) {
      this.raise(this.lastTokEnd, "Complex binding patterns require an initialization value");
    } else {
      decl.init = null;
    }
    node2.declarations.push(this.finishNode(decl, "VariableDeclarator"));
    if (!this.eat(types$1.comma)) {
      break;
    }
  }
  return node2;
};
pp$8.parseVarId = function(decl, kind) {
  decl.id = kind === "using" || kind === "await using" ? this.parseIdent() : this.parseBindingAtom();
  this.checkLValPattern(decl.id, kind === "var" ? BIND_VAR : BIND_LEXICAL, false);
};
var FUNC_STATEMENT = 1;
var FUNC_HANGING_STATEMENT = 2;
var FUNC_NULLABLE_ID = 4;
pp$8.parseFunction = function(node2, statement, allowExpressionBody, isAsync, forInit) {
  this.initFunction(node2);
  if (this.options.ecmaVersion >= 9 || this.options.ecmaVersion >= 6 && !isAsync) {
    if (this.type === types$1.star && statement & FUNC_HANGING_STATEMENT) {
      this.unexpected();
    }
    node2.generator = this.eat(types$1.star);
  }
  if (this.options.ecmaVersion >= 8) {
    node2.async = !!isAsync;
  }
  if (statement & FUNC_STATEMENT) {
    node2.id = statement & FUNC_NULLABLE_ID && this.type !== types$1.name ? null : this.parseIdent();
    if (node2.id && !(statement & FUNC_HANGING_STATEMENT)) {
      this.checkLValSimple(node2.id, this.strict || node2.generator || node2.async ? this.treatFunctionsAsVar ? BIND_VAR : BIND_LEXICAL : BIND_FUNCTION);
    }
  }
  var oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;
  this.yieldPos = 0;
  this.awaitPos = 0;
  this.awaitIdentPos = 0;
  this.enterScope(functionFlags(node2.async, node2.generator));
  if (!(statement & FUNC_STATEMENT)) {
    node2.id = this.type === types$1.name ? this.parseIdent() : null;
  }
  this.parseFunctionParams(node2);
  this.parseFunctionBody(node2, allowExpressionBody, false, forInit);
  this.yieldPos = oldYieldPos;
  this.awaitPos = oldAwaitPos;
  this.awaitIdentPos = oldAwaitIdentPos;
  return this.finishNode(node2, statement & FUNC_STATEMENT ? "FunctionDeclaration" : "FunctionExpression");
};
pp$8.parseFunctionParams = function(node2) {
  this.expect(types$1.parenL);
  node2.params = this.parseBindingList(types$1.parenR, false, this.options.ecmaVersion >= 8);
  this.checkYieldAwaitInDefaultParams();
};
pp$8.parseClass = function(node2, isStatement) {
  this.next();
  var oldStrict = this.strict;
  this.strict = true;
  this.parseClassId(node2, isStatement);
  this.parseClassSuper(node2);
  var privateNameMap = this.enterClassBody();
  var classBody = this.startNode();
  var hadConstructor = false;
  classBody.body = [];
  this.expect(types$1.braceL);
  while (this.type !== types$1.braceR) {
    var element = this.parseClassElement(node2.superClass !== null);
    if (element) {
      classBody.body.push(element);
      if (element.type === "MethodDefinition" && element.kind === "constructor") {
        if (hadConstructor) {
          this.raiseRecoverable(element.start, "Duplicate constructor in the same class");
        }
        hadConstructor = true;
      } else if (element.key && element.key.type === "PrivateIdentifier" && isPrivateNameConflicted(privateNameMap, element)) {
        this.raiseRecoverable(element.key.start, "Identifier '#" + element.key.name + "' has already been declared");
      }
    }
  }
  this.strict = oldStrict;
  this.next();
  node2.body = this.finishNode(classBody, "ClassBody");
  this.exitClassBody();
  return this.finishNode(node2, isStatement ? "ClassDeclaration" : "ClassExpression");
};
pp$8.parseClassElement = function(constructorAllowsSuper) {
  if (this.eat(types$1.semi)) {
    return null;
  }
  var ecmaVersion2 = this.options.ecmaVersion;
  var node2 = this.startNode();
  var keyName = "";
  var isGenerator = false;
  var isAsync = false;
  var kind = "method";
  var isStatic = false;
  if (this.eatContextual("static")) {
    if (ecmaVersion2 >= 13 && this.eat(types$1.braceL)) {
      this.parseClassStaticBlock(node2);
      return node2;
    }
    if (this.isClassElementNameStart() || this.type === types$1.star) {
      isStatic = true;
    } else {
      keyName = "static";
    }
  }
  node2.static = isStatic;
  if (!keyName && ecmaVersion2 >= 8 && this.eatContextual("async")) {
    if ((this.isClassElementNameStart() || this.type === types$1.star) && !this.canInsertSemicolon()) {
      isAsync = true;
    } else {
      keyName = "async";
    }
  }
  if (!keyName && (ecmaVersion2 >= 9 || !isAsync) && this.eat(types$1.star)) {
    isGenerator = true;
  }
  if (!keyName && !isAsync && !isGenerator) {
    var lastValue = this.value;
    if (this.eatContextual("get") || this.eatContextual("set")) {
      if (this.isClassElementNameStart()) {
        kind = lastValue;
      } else {
        keyName = lastValue;
      }
    }
  }
  if (keyName) {
    node2.computed = false;
    node2.key = this.startNodeAt(this.lastTokStart, this.lastTokStartLoc);
    node2.key.name = keyName;
    this.finishNode(node2.key, "Identifier");
  } else {
    this.parseClassElementName(node2);
  }
  if (ecmaVersion2 < 13 || this.type === types$1.parenL || kind !== "method" || isGenerator || isAsync) {
    var isConstructor = !node2.static && checkKeyName(node2, "constructor");
    var allowsDirectSuper = isConstructor && constructorAllowsSuper;
    if (isConstructor && kind !== "method") {
      this.raise(node2.key.start, "Constructor can't have get/set modifier");
    }
    node2.kind = isConstructor ? "constructor" : kind;
    this.parseClassMethod(node2, isGenerator, isAsync, allowsDirectSuper);
  } else {
    this.parseClassField(node2);
  }
  return node2;
};
pp$8.isClassElementNameStart = function() {
  return this.type === types$1.name || this.type === types$1.privateId || this.type === types$1.num || this.type === types$1.string || this.type === types$1.bracketL || this.type.keyword;
};
pp$8.parseClassElementName = function(element) {
  if (this.type === types$1.privateId) {
    if (this.value === "constructor") {
      this.raise(this.start, "Classes can't have an element named '#constructor'");
    }
    element.computed = false;
    element.key = this.parsePrivateIdent();
  } else {
    this.parsePropertyName(element);
  }
};
pp$8.parseClassMethod = function(method, isGenerator, isAsync, allowsDirectSuper) {
  var key = method.key;
  if (method.kind === "constructor") {
    if (isGenerator) {
      this.raise(key.start, "Constructor can't be a generator");
    }
    if (isAsync) {
      this.raise(key.start, "Constructor can't be an async method");
    }
  } else if (method.static && checkKeyName(method, "prototype")) {
    this.raise(key.start, "Classes may not have a static property named prototype");
  }
  var value = method.value = this.parseMethod(isGenerator, isAsync, allowsDirectSuper);
  if (method.kind === "get" && value.params.length !== 0) {
    this.raiseRecoverable(value.start, "getter should have no params");
  }
  if (method.kind === "set" && value.params.length !== 1) {
    this.raiseRecoverable(value.start, "setter should have exactly one param");
  }
  if (method.kind === "set" && value.params[0].type === "RestElement") {
    this.raiseRecoverable(value.params[0].start, "Setter cannot use rest params");
  }
  return this.finishNode(method, "MethodDefinition");
};
pp$8.parseClassField = function(field) {
  if (checkKeyName(field, "constructor")) {
    this.raise(field.key.start, "Classes can't have a field named 'constructor'");
  } else if (field.static && checkKeyName(field, "prototype")) {
    this.raise(field.key.start, "Classes can't have a static field named 'prototype'");
  }
  if (this.eat(types$1.eq)) {
    this.enterScope(SCOPE_CLASS_FIELD_INIT | SCOPE_SUPER);
    field.value = this.parseMaybeAssign();
    this.exitScope();
  } else {
    field.value = null;
  }
  this.semicolon();
  return this.finishNode(field, "PropertyDefinition");
};
pp$8.parseClassStaticBlock = function(node2) {
  node2.body = [];
  var oldLabels = this.labels;
  this.labels = [];
  this.enterScope(SCOPE_CLASS_STATIC_BLOCK | SCOPE_SUPER);
  while (this.type !== types$1.braceR) {
    var stmt = this.parseStatement(null);
    node2.body.push(stmt);
  }
  this.next();
  this.exitScope();
  this.labels = oldLabels;
  return this.finishNode(node2, "StaticBlock");
};
pp$8.parseClassId = function(node2, isStatement) {
  if (this.type === types$1.name) {
    node2.id = this.parseIdent();
    if (isStatement) {
      this.checkLValSimple(node2.id, BIND_LEXICAL, false);
    }
  } else {
    if (isStatement === true) {
      this.unexpected();
    }
    node2.id = null;
  }
};
pp$8.parseClassSuper = function(node2) {
  node2.superClass = this.eat(types$1._extends) ? this.parseExprSubscripts(null, false) : null;
};
pp$8.enterClassBody = function() {
  var element = { declared: /* @__PURE__ */ Object.create(null), used: [] };
  this.privateNameStack.push(element);
  return element.declared;
};
pp$8.exitClassBody = function() {
  var ref2 = this.privateNameStack.pop();
  var declared = ref2.declared;
  var used = ref2.used;
  if (!this.options.checkPrivateFields) {
    return;
  }
  var len = this.privateNameStack.length;
  var parent = len === 0 ? null : this.privateNameStack[len - 1];
  for (var i2 = 0; i2 < used.length; ++i2) {
    var id = used[i2];
    if (!hasOwn(declared, id.name)) {
      if (parent) {
        parent.used.push(id);
      } else {
        this.raiseRecoverable(id.start, "Private field '#" + id.name + "' must be declared in an enclosing class");
      }
    }
  }
};
function isPrivateNameConflicted(privateNameMap, element) {
  var name = element.key.name;
  var curr = privateNameMap[name];
  var next = "true";
  if (element.type === "MethodDefinition" && (element.kind === "get" || element.kind === "set")) {
    next = (element.static ? "s" : "i") + element.kind;
  }
  if (curr === "iget" && next === "iset" || curr === "iset" && next === "iget" || curr === "sget" && next === "sset" || curr === "sset" && next === "sget") {
    privateNameMap[name] = "true";
    return false;
  } else if (!curr) {
    privateNameMap[name] = next;
    return false;
  } else {
    return true;
  }
}
function checkKeyName(node2, name) {
  var computed = node2.computed;
  var key = node2.key;
  return !computed && (key.type === "Identifier" && key.name === name || key.type === "Literal" && key.value === name);
}
pp$8.parseExportAllDeclaration = function(node2, exports$1) {
  if (this.options.ecmaVersion >= 11) {
    if (this.eatContextual("as")) {
      node2.exported = this.parseModuleExportName();
      this.checkExport(exports$1, node2.exported, this.lastTokStart);
    } else {
      node2.exported = null;
    }
  }
  this.expectContextual("from");
  if (this.type !== types$1.string) {
    this.unexpected();
  }
  node2.source = this.parseExprAtom();
  if (this.options.ecmaVersion >= 16) {
    node2.attributes = this.parseWithClause();
  }
  this.semicolon();
  return this.finishNode(node2, "ExportAllDeclaration");
};
pp$8.parseExport = function(node2, exports$1) {
  this.next();
  if (this.eat(types$1.star)) {
    return this.parseExportAllDeclaration(node2, exports$1);
  }
  if (this.eat(types$1._default)) {
    this.checkExport(exports$1, "default", this.lastTokStart);
    node2.declaration = this.parseExportDefaultDeclaration();
    return this.finishNode(node2, "ExportDefaultDeclaration");
  }
  if (this.shouldParseExportStatement()) {
    node2.declaration = this.parseExportDeclaration(node2);
    if (node2.declaration.type === "VariableDeclaration") {
      this.checkVariableExport(exports$1, node2.declaration.declarations);
    } else {
      this.checkExport(exports$1, node2.declaration.id, node2.declaration.id.start);
    }
    node2.specifiers = [];
    node2.source = null;
    if (this.options.ecmaVersion >= 16) {
      node2.attributes = [];
    }
  } else {
    node2.declaration = null;
    node2.specifiers = this.parseExportSpecifiers(exports$1);
    if (this.eatContextual("from")) {
      if (this.type !== types$1.string) {
        this.unexpected();
      }
      node2.source = this.parseExprAtom();
      if (this.options.ecmaVersion >= 16) {
        node2.attributes = this.parseWithClause();
      }
    } else {
      for (var i2 = 0, list2 = node2.specifiers; i2 < list2.length; i2 += 1) {
        var spec = list2[i2];
        this.checkUnreserved(spec.local);
        this.checkLocalExport(spec.local);
        if (spec.local.type === "Literal") {
          this.raise(spec.local.start, "A string literal cannot be used as an exported binding without `from`.");
        }
      }
      node2.source = null;
      if (this.options.ecmaVersion >= 16) {
        node2.attributes = [];
      }
    }
    this.semicolon();
  }
  return this.finishNode(node2, "ExportNamedDeclaration");
};
pp$8.parseExportDeclaration = function(node2) {
  return this.parseStatement(null);
};
pp$8.parseExportDefaultDeclaration = function() {
  var isAsync;
  if (this.type === types$1._function || (isAsync = this.isAsyncFunction())) {
    var fNode = this.startNode();
    this.next();
    if (isAsync) {
      this.next();
    }
    return this.parseFunction(fNode, FUNC_STATEMENT | FUNC_NULLABLE_ID, false, isAsync);
  } else if (this.type === types$1._class) {
    var cNode = this.startNode();
    return this.parseClass(cNode, "nullableID");
  } else {
    var declaration = this.parseMaybeAssign();
    this.semicolon();
    return declaration;
  }
};
pp$8.checkExport = function(exports$1, name, pos) {
  if (!exports$1) {
    return;
  }
  if (typeof name !== "string") {
    name = name.type === "Identifier" ? name.name : name.value;
  }
  if (hasOwn(exports$1, name)) {
    this.raiseRecoverable(pos, "Duplicate export '" + name + "'");
  }
  exports$1[name] = true;
};
pp$8.checkPatternExport = function(exports$1, pat) {
  var type = pat.type;
  if (type === "Identifier") {
    this.checkExport(exports$1, pat, pat.start);
  } else if (type === "ObjectPattern") {
    for (var i2 = 0, list2 = pat.properties; i2 < list2.length; i2 += 1) {
      var prop = list2[i2];
      this.checkPatternExport(exports$1, prop);
    }
  } else if (type === "ArrayPattern") {
    for (var i$1 = 0, list$1 = pat.elements; i$1 < list$1.length; i$1 += 1) {
      var elt = list$1[i$1];
      if (elt) {
        this.checkPatternExport(exports$1, elt);
      }
    }
  } else if (type === "Property") {
    this.checkPatternExport(exports$1, pat.value);
  } else if (type === "AssignmentPattern") {
    this.checkPatternExport(exports$1, pat.left);
  } else if (type === "RestElement") {
    this.checkPatternExport(exports$1, pat.argument);
  }
};
pp$8.checkVariableExport = function(exports$1, decls) {
  if (!exports$1) {
    return;
  }
  for (var i2 = 0, list2 = decls; i2 < list2.length; i2 += 1) {
    var decl = list2[i2];
    this.checkPatternExport(exports$1, decl.id);
  }
};
pp$8.shouldParseExportStatement = function() {
  return this.type.keyword === "var" || this.type.keyword === "const" || this.type.keyword === "class" || this.type.keyword === "function" || this.isLet() || this.isAsyncFunction();
};
pp$8.parseExportSpecifier = function(exports$1) {
  var node2 = this.startNode();
  node2.local = this.parseModuleExportName();
  node2.exported = this.eatContextual("as") ? this.parseModuleExportName() : node2.local;
  this.checkExport(
    exports$1,
    node2.exported,
    node2.exported.start
  );
  return this.finishNode(node2, "ExportSpecifier");
};
pp$8.parseExportSpecifiers = function(exports$1) {
  var nodes = [], first = true;
  this.expect(types$1.braceL);
  while (!this.eat(types$1.braceR)) {
    if (!first) {
      this.expect(types$1.comma);
      if (this.afterTrailingComma(types$1.braceR)) {
        break;
      }
    } else {
      first = false;
    }
    nodes.push(this.parseExportSpecifier(exports$1));
  }
  return nodes;
};
pp$8.parseImport = function(node2) {
  this.next();
  if (this.type === types$1.string) {
    node2.specifiers = empty$1;
    node2.source = this.parseExprAtom();
  } else {
    node2.specifiers = this.parseImportSpecifiers();
    this.expectContextual("from");
    node2.source = this.type === types$1.string ? this.parseExprAtom() : this.unexpected();
  }
  if (this.options.ecmaVersion >= 16) {
    node2.attributes = this.parseWithClause();
  }
  this.semicolon();
  return this.finishNode(node2, "ImportDeclaration");
};
pp$8.parseImportSpecifier = function() {
  var node2 = this.startNode();
  node2.imported = this.parseModuleExportName();
  if (this.eatContextual("as")) {
    node2.local = this.parseIdent();
  } else {
    this.checkUnreserved(node2.imported);
    node2.local = node2.imported;
  }
  this.checkLValSimple(node2.local, BIND_LEXICAL);
  return this.finishNode(node2, "ImportSpecifier");
};
pp$8.parseImportDefaultSpecifier = function() {
  var node2 = this.startNode();
  node2.local = this.parseIdent();
  this.checkLValSimple(node2.local, BIND_LEXICAL);
  return this.finishNode(node2, "ImportDefaultSpecifier");
};
pp$8.parseImportNamespaceSpecifier = function() {
  var node2 = this.startNode();
  this.next();
  this.expectContextual("as");
  node2.local = this.parseIdent();
  this.checkLValSimple(node2.local, BIND_LEXICAL);
  return this.finishNode(node2, "ImportNamespaceSpecifier");
};
pp$8.parseImportSpecifiers = function() {
  var nodes = [], first = true;
  if (this.type === types$1.name) {
    nodes.push(this.parseImportDefaultSpecifier());
    if (!this.eat(types$1.comma)) {
      return nodes;
    }
  }
  if (this.type === types$1.star) {
    nodes.push(this.parseImportNamespaceSpecifier());
    return nodes;
  }
  this.expect(types$1.braceL);
  while (!this.eat(types$1.braceR)) {
    if (!first) {
      this.expect(types$1.comma);
      if (this.afterTrailingComma(types$1.braceR)) {
        break;
      }
    } else {
      first = false;
    }
    nodes.push(this.parseImportSpecifier());
  }
  return nodes;
};
pp$8.parseWithClause = function() {
  var nodes = [];
  if (!this.eat(types$1._with)) {
    return nodes;
  }
  this.expect(types$1.braceL);
  var attributeKeys = {};
  var first = true;
  while (!this.eat(types$1.braceR)) {
    if (!first) {
      this.expect(types$1.comma);
      if (this.afterTrailingComma(types$1.braceR)) {
        break;
      }
    } else {
      first = false;
    }
    var attr = this.parseImportAttribute();
    var keyName = attr.key.type === "Identifier" ? attr.key.name : attr.key.value;
    if (hasOwn(attributeKeys, keyName)) {
      this.raiseRecoverable(attr.key.start, "Duplicate attribute key '" + keyName + "'");
    }
    attributeKeys[keyName] = true;
    nodes.push(attr);
  }
  return nodes;
};
pp$8.parseImportAttribute = function() {
  var node2 = this.startNode();
  node2.key = this.type === types$1.string ? this.parseExprAtom() : this.parseIdent(this.options.allowReserved !== "never");
  this.expect(types$1.colon);
  if (this.type !== types$1.string) {
    this.unexpected();
  }
  node2.value = this.parseExprAtom();
  return this.finishNode(node2, "ImportAttribute");
};
pp$8.parseModuleExportName = function() {
  if (this.options.ecmaVersion >= 13 && this.type === types$1.string) {
    var stringLiteral = this.parseLiteral(this.value);
    if (loneSurrogate.test(stringLiteral.value)) {
      this.raise(stringLiteral.start, "An export name cannot include a lone surrogate.");
    }
    return stringLiteral;
  }
  return this.parseIdent(true);
};
pp$8.adaptDirectivePrologue = function(statements) {
  for (var i2 = 0; i2 < statements.length && this.isDirectiveCandidate(statements[i2]); ++i2) {
    statements[i2].directive = statements[i2].expression.raw.slice(1, -1);
  }
};
pp$8.isDirectiveCandidate = function(statement) {
  return this.options.ecmaVersion >= 5 && statement.type === "ExpressionStatement" && statement.expression.type === "Literal" && typeof statement.expression.value === "string" && // Reject parenthesized strings.
  (this.input[statement.start] === '"' || this.input[statement.start] === "'");
};
var pp$7 = Parser.prototype;
pp$7.toAssignable = function(node2, isBinding, refDestructuringErrors) {
  if (this.options.ecmaVersion >= 6 && node2) {
    switch (node2.type) {
      case "Identifier":
        if (this.inAsync && node2.name === "await") {
          this.raise(node2.start, "Cannot use 'await' as identifier inside an async function");
        }
        break;
      case "ObjectPattern":
      case "ArrayPattern":
      case "AssignmentPattern":
      case "RestElement":
        break;
      case "ObjectExpression":
        node2.type = "ObjectPattern";
        if (refDestructuringErrors) {
          this.checkPatternErrors(refDestructuringErrors, true);
        }
        for (var i2 = 0, list2 = node2.properties; i2 < list2.length; i2 += 1) {
          var prop = list2[i2];
          this.toAssignable(prop, isBinding);
          if (prop.type === "RestElement" && (prop.argument.type === "ArrayPattern" || prop.argument.type === "ObjectPattern")) {
            this.raise(prop.argument.start, "Unexpected token");
          }
        }
        break;
      case "Property":
        if (node2.kind !== "init") {
          this.raise(node2.key.start, "Object pattern can't contain getter or setter");
        }
        this.toAssignable(node2.value, isBinding);
        break;
      case "ArrayExpression":
        node2.type = "ArrayPattern";
        if (refDestructuringErrors) {
          this.checkPatternErrors(refDestructuringErrors, true);
        }
        this.toAssignableList(node2.elements, isBinding);
        break;
      case "SpreadElement":
        node2.type = "RestElement";
        this.toAssignable(node2.argument, isBinding);
        if (node2.argument.type === "AssignmentPattern") {
          this.raise(node2.argument.start, "Rest elements cannot have a default value");
        }
        break;
      case "AssignmentExpression":
        if (node2.operator !== "=") {
          this.raise(node2.left.end, "Only '=' operator can be used for specifying default value.");
        }
        node2.type = "AssignmentPattern";
        delete node2.operator;
        this.toAssignable(node2.left, isBinding);
        break;
      case "ParenthesizedExpression":
        this.toAssignable(node2.expression, isBinding, refDestructuringErrors);
        break;
      case "ChainExpression":
        this.raiseRecoverable(node2.start, "Optional chaining cannot appear in left-hand side");
        break;
      case "MemberExpression":
        if (!isBinding) {
          break;
        }
      default:
        this.raise(node2.start, "Assigning to rvalue");
    }
  } else if (refDestructuringErrors) {
    this.checkPatternErrors(refDestructuringErrors, true);
  }
  return node2;
};
pp$7.toAssignableList = function(exprList, isBinding) {
  var end = exprList.length;
  for (var i2 = 0; i2 < end; i2++) {
    var elt = exprList[i2];
    if (elt) {
      this.toAssignable(elt, isBinding);
    }
  }
  if (end) {
    var last = exprList[end - 1];
    if (this.options.ecmaVersion === 6 && isBinding && last && last.type === "RestElement" && last.argument.type !== "Identifier") {
      this.unexpected(last.argument.start);
    }
  }
  return exprList;
};
pp$7.parseSpread = function(refDestructuringErrors) {
  var node2 = this.startNode();
  this.next();
  node2.argument = this.parseMaybeAssign(false, refDestructuringErrors);
  return this.finishNode(node2, "SpreadElement");
};
pp$7.parseRestBinding = function() {
  var node2 = this.startNode();
  this.next();
  if (this.options.ecmaVersion === 6 && this.type !== types$1.name) {
    this.unexpected();
  }
  node2.argument = this.parseBindingAtom();
  return this.finishNode(node2, "RestElement");
};
pp$7.parseBindingAtom = function() {
  if (this.options.ecmaVersion >= 6) {
    switch (this.type) {
      case types$1.bracketL:
        var node2 = this.startNode();
        this.next();
        node2.elements = this.parseBindingList(types$1.bracketR, true, true);
        return this.finishNode(node2, "ArrayPattern");
      case types$1.braceL:
        return this.parseObj(true);
    }
  }
  return this.parseIdent();
};
pp$7.parseBindingList = function(close, allowEmpty, allowTrailingComma, allowModifiers) {
  var elts = [], first = true;
  while (!this.eat(close)) {
    if (first) {
      first = false;
    } else {
      this.expect(types$1.comma);
    }
    if (allowEmpty && this.type === types$1.comma) {
      elts.push(null);
    } else if (allowTrailingComma && this.afterTrailingComma(close)) {
      break;
    } else if (this.type === types$1.ellipsis) {
      var rest = this.parseRestBinding();
      this.parseBindingListItem(rest);
      elts.push(rest);
      if (this.type === types$1.comma) {
        this.raiseRecoverable(this.start, "Comma is not permitted after the rest element");
      }
      this.expect(close);
      break;
    } else {
      elts.push(this.parseAssignableListItem(allowModifiers));
    }
  }
  return elts;
};
pp$7.parseAssignableListItem = function(allowModifiers) {
  var elem = this.parseMaybeDefault(this.start, this.startLoc);
  this.parseBindingListItem(elem);
  return elem;
};
pp$7.parseBindingListItem = function(param) {
  return param;
};
pp$7.parseMaybeDefault = function(startPos, startLoc, left) {
  left = left || this.parseBindingAtom();
  if (this.options.ecmaVersion < 6 || !this.eat(types$1.eq)) {
    return left;
  }
  var node2 = this.startNodeAt(startPos, startLoc);
  node2.left = left;
  node2.right = this.parseMaybeAssign();
  return this.finishNode(node2, "AssignmentPattern");
};
pp$7.checkLValSimple = function(expr, bindingType, checkClashes) {
  if (bindingType === void 0) bindingType = BIND_NONE;
  var isBind = bindingType !== BIND_NONE;
  switch (expr.type) {
    case "Identifier":
      if (this.strict && this.reservedWordsStrictBind.test(expr.name)) {
        this.raiseRecoverable(expr.start, (isBind ? "Binding " : "Assigning to ") + expr.name + " in strict mode");
      }
      if (isBind) {
        if (bindingType === BIND_LEXICAL && expr.name === "let") {
          this.raiseRecoverable(expr.start, "let is disallowed as a lexically bound name");
        }
        if (checkClashes) {
          if (hasOwn(checkClashes, expr.name)) {
            this.raiseRecoverable(expr.start, "Argument name clash");
          }
          checkClashes[expr.name] = true;
        }
        if (bindingType !== BIND_OUTSIDE) {
          this.declareName(expr.name, bindingType, expr.start);
        }
      }
      break;
    case "ChainExpression":
      this.raiseRecoverable(expr.start, "Optional chaining cannot appear in left-hand side");
      break;
    case "MemberExpression":
      if (isBind) {
        this.raiseRecoverable(expr.start, "Binding member expression");
      }
      break;
    case "ParenthesizedExpression":
      if (isBind) {
        this.raiseRecoverable(expr.start, "Binding parenthesized expression");
      }
      return this.checkLValSimple(expr.expression, bindingType, checkClashes);
    default:
      this.raise(expr.start, (isBind ? "Binding" : "Assigning to") + " rvalue");
  }
};
pp$7.checkLValPattern = function(expr, bindingType, checkClashes) {
  if (bindingType === void 0) bindingType = BIND_NONE;
  switch (expr.type) {
    case "ObjectPattern":
      for (var i2 = 0, list2 = expr.properties; i2 < list2.length; i2 += 1) {
        var prop = list2[i2];
        this.checkLValInnerPattern(prop, bindingType, checkClashes);
      }
      break;
    case "ArrayPattern":
      for (var i$1 = 0, list$1 = expr.elements; i$1 < list$1.length; i$1 += 1) {
        var elem = list$1[i$1];
        if (elem) {
          this.checkLValInnerPattern(elem, bindingType, checkClashes);
        }
      }
      break;
    default:
      this.checkLValSimple(expr, bindingType, checkClashes);
  }
};
pp$7.checkLValInnerPattern = function(expr, bindingType, checkClashes) {
  if (bindingType === void 0) bindingType = BIND_NONE;
  switch (expr.type) {
    case "Property":
      this.checkLValInnerPattern(expr.value, bindingType, checkClashes);
      break;
    case "AssignmentPattern":
      this.checkLValPattern(expr.left, bindingType, checkClashes);
      break;
    case "RestElement":
      this.checkLValPattern(expr.argument, bindingType, checkClashes);
      break;
    default:
      this.checkLValPattern(expr, bindingType, checkClashes);
  }
};
var TokContext = function TokContext2(token, isExpr, preserveSpace, override, generator) {
  this.token = token;
  this.isExpr = !!isExpr;
  this.preserveSpace = !!preserveSpace;
  this.override = override;
  this.generator = !!generator;
};
var types = {
  b_stat: new TokContext("{", false),
  b_expr: new TokContext("{", true),
  b_tmpl: new TokContext("${", false),
  p_stat: new TokContext("(", false),
  p_expr: new TokContext("(", true),
  q_tmpl: new TokContext("`", true, true, function(p) {
    return p.tryReadTemplateToken();
  }),
  f_stat: new TokContext("function", false),
  f_expr: new TokContext("function", true),
  f_expr_gen: new TokContext("function", true, false, null, true),
  f_gen: new TokContext("function", false, false, null, true)
};
var pp$6 = Parser.prototype;
pp$6.initialContext = function() {
  return [types.b_stat];
};
pp$6.curContext = function() {
  return this.context[this.context.length - 1];
};
pp$6.braceIsBlock = function(prevType) {
  var parent = this.curContext();
  if (parent === types.f_expr || parent === types.f_stat) {
    return true;
  }
  if (prevType === types$1.colon && (parent === types.b_stat || parent === types.b_expr)) {
    return !parent.isExpr;
  }
  if (prevType === types$1._return || prevType === types$1.name && this.exprAllowed) {
    return lineBreak.test(this.input.slice(this.lastTokEnd, this.start));
  }
  if (prevType === types$1._else || prevType === types$1.semi || prevType === types$1.eof || prevType === types$1.parenR || prevType === types$1.arrow) {
    return true;
  }
  if (prevType === types$1.braceL) {
    return parent === types.b_stat;
  }
  if (prevType === types$1._var || prevType === types$1._const || prevType === types$1.name) {
    return false;
  }
  return !this.exprAllowed;
};
pp$6.inGeneratorContext = function() {
  for (var i2 = this.context.length - 1; i2 >= 1; i2--) {
    var context = this.context[i2];
    if (context.token === "function") {
      return context.generator;
    }
  }
  return false;
};
pp$6.updateContext = function(prevType) {
  var update, type = this.type;
  if (type.keyword && prevType === types$1.dot) {
    this.exprAllowed = false;
  } else if (update = type.updateContext) {
    update.call(this, prevType);
  } else {
    this.exprAllowed = type.beforeExpr;
  }
};
pp$6.overrideContext = function(tokenCtx) {
  if (this.curContext() !== tokenCtx) {
    this.context[this.context.length - 1] = tokenCtx;
  }
};
types$1.parenR.updateContext = types$1.braceR.updateContext = function() {
  if (this.context.length === 1) {
    this.exprAllowed = true;
    return;
  }
  var out = this.context.pop();
  if (out === types.b_stat && this.curContext().token === "function") {
    out = this.context.pop();
  }
  this.exprAllowed = !out.isExpr;
};
types$1.braceL.updateContext = function(prevType) {
  this.context.push(this.braceIsBlock(prevType) ? types.b_stat : types.b_expr);
  this.exprAllowed = true;
};
types$1.dollarBraceL.updateContext = function() {
  this.context.push(types.b_tmpl);
  this.exprAllowed = true;
};
types$1.parenL.updateContext = function(prevType) {
  var statementParens = prevType === types$1._if || prevType === types$1._for || prevType === types$1._with || prevType === types$1._while;
  this.context.push(statementParens ? types.p_stat : types.p_expr);
  this.exprAllowed = true;
};
types$1.incDec.updateContext = function() {
};
types$1._function.updateContext = types$1._class.updateContext = function(prevType) {
  if (prevType.beforeExpr && prevType !== types$1._else && !(prevType === types$1.semi && this.curContext() !== types.p_stat) && !(prevType === types$1._return && lineBreak.test(this.input.slice(this.lastTokEnd, this.start))) && !((prevType === types$1.colon || prevType === types$1.braceL) && this.curContext() === types.b_stat)) {
    this.context.push(types.f_expr);
  } else {
    this.context.push(types.f_stat);
  }
  this.exprAllowed = false;
};
types$1.colon.updateContext = function() {
  if (this.curContext().token === "function") {
    this.context.pop();
  }
  this.exprAllowed = true;
};
types$1.backQuote.updateContext = function() {
  if (this.curContext() === types.q_tmpl) {
    this.context.pop();
  } else {
    this.context.push(types.q_tmpl);
  }
  this.exprAllowed = false;
};
types$1.star.updateContext = function(prevType) {
  if (prevType === types$1._function) {
    var index = this.context.length - 1;
    if (this.context[index] === types.f_expr) {
      this.context[index] = types.f_expr_gen;
    } else {
      this.context[index] = types.f_gen;
    }
  }
  this.exprAllowed = true;
};
types$1.name.updateContext = function(prevType) {
  var allowed = false;
  if (this.options.ecmaVersion >= 6 && prevType !== types$1.dot) {
    if (this.value === "of" && !this.exprAllowed || this.value === "yield" && this.inGeneratorContext()) {
      allowed = true;
    }
  }
  this.exprAllowed = allowed;
};
var pp$5 = Parser.prototype;
pp$5.checkPropClash = function(prop, propHash, refDestructuringErrors) {
  if (this.options.ecmaVersion >= 9 && prop.type === "SpreadElement") {
    return;
  }
  if (this.options.ecmaVersion >= 6 && (prop.computed || prop.method || prop.shorthand)) {
    return;
  }
  var key = prop.key;
  var name;
  switch (key.type) {
    case "Identifier":
      name = key.name;
      break;
    case "Literal":
      name = String(key.value);
      break;
    default:
      return;
  }
  var kind = prop.kind;
  if (this.options.ecmaVersion >= 6) {
    if (name === "__proto__" && kind === "init") {
      if (propHash.proto) {
        if (refDestructuringErrors) {
          if (refDestructuringErrors.doubleProto < 0) {
            refDestructuringErrors.doubleProto = key.start;
          }
        } else {
          this.raiseRecoverable(key.start, "Redefinition of __proto__ property");
        }
      }
      propHash.proto = true;
    }
    return;
  }
  name = "$" + name;
  var other = propHash[name];
  if (other) {
    var redefinition;
    if (kind === "init") {
      redefinition = this.strict && other.init || other.get || other.set;
    } else {
      redefinition = other.init || other[kind];
    }
    if (redefinition) {
      this.raiseRecoverable(key.start, "Redefinition of property");
    }
  } else {
    other = propHash[name] = {
      init: false,
      get: false,
      set: false
    };
  }
  other[kind] = true;
};
pp$5.parseExpression = function(forInit, refDestructuringErrors) {
  var this$1$1 = this;
  return this.catchStackOverflow(function() {
    var startPos = this$1$1.start, startLoc = this$1$1.startLoc;
    var expr = this$1$1.parseMaybeAssign(forInit, refDestructuringErrors);
    if (this$1$1.type === types$1.comma) {
      var node2 = this$1$1.startNodeAt(startPos, startLoc);
      node2.expressions = [expr];
      while (this$1$1.eat(types$1.comma)) {
        node2.expressions.push(this$1$1.parseMaybeAssign(forInit, refDestructuringErrors));
      }
      return this$1$1.finishNode(node2, "SequenceExpression");
    }
    return expr;
  });
};
pp$5.parseMaybeAssign = function(forInit, refDestructuringErrors, afterLeftParse) {
  if (this.isContextual("yield")) {
    if (this.inGenerator) {
      return this.parseYield(forInit);
    } else {
      this.exprAllowed = false;
    }
  }
  var ownDestructuringErrors = false, oldParenAssign = -1, oldTrailingComma = -1, oldDoubleProto = -1;
  if (refDestructuringErrors) {
    oldParenAssign = refDestructuringErrors.parenthesizedAssign;
    oldTrailingComma = refDestructuringErrors.trailingComma;
    oldDoubleProto = refDestructuringErrors.doubleProto;
    refDestructuringErrors.parenthesizedAssign = refDestructuringErrors.trailingComma = -1;
  } else {
    refDestructuringErrors = new DestructuringErrors();
    ownDestructuringErrors = true;
  }
  var startPos = this.start, startLoc = this.startLoc;
  if (this.type === types$1.parenL || this.type === types$1.name) {
    this.potentialArrowAt = this.start;
    this.potentialArrowInForAwait = forInit === "await";
  }
  var left = this.parseMaybeConditional(forInit, refDestructuringErrors);
  if (afterLeftParse) {
    left = afterLeftParse.call(this, left, startPos, startLoc);
  }
  if (this.type.isAssign) {
    var node2 = this.startNodeAt(startPos, startLoc);
    node2.operator = this.value;
    if (this.type === types$1.eq) {
      left = this.toAssignable(left, false, refDestructuringErrors);
    }
    if (!ownDestructuringErrors) {
      refDestructuringErrors.parenthesizedAssign = refDestructuringErrors.trailingComma = refDestructuringErrors.doubleProto = -1;
    }
    if (refDestructuringErrors.shorthandAssign >= left.start) {
      refDestructuringErrors.shorthandAssign = -1;
    }
    if (this.type === types$1.eq) {
      this.checkLValPattern(left);
    } else {
      this.checkLValSimple(left);
    }
    node2.left = left;
    this.next();
    node2.right = this.parseMaybeAssign(forInit);
    if (oldDoubleProto > -1) {
      refDestructuringErrors.doubleProto = oldDoubleProto;
    }
    return this.finishNode(node2, "AssignmentExpression");
  } else {
    if (ownDestructuringErrors) {
      this.checkExpressionErrors(refDestructuringErrors, true);
    }
  }
  if (oldParenAssign > -1) {
    refDestructuringErrors.parenthesizedAssign = oldParenAssign;
  }
  if (oldTrailingComma > -1) {
    refDestructuringErrors.trailingComma = oldTrailingComma;
  }
  return left;
};
pp$5.parseMaybeConditional = function(forInit, refDestructuringErrors) {
  var startPos = this.start, startLoc = this.startLoc;
  var expr = this.parseExprOps(forInit, refDestructuringErrors);
  if (this.checkExpressionErrors(refDestructuringErrors)) {
    return expr;
  }
  if (!(expr.type === "ArrowFunctionExpression" && expr.start === startPos) && this.eat(types$1.question)) {
    var node2 = this.startNodeAt(startPos, startLoc);
    node2.test = expr;
    node2.consequent = this.parseMaybeAssign();
    this.expect(types$1.colon);
    node2.alternate = this.parseMaybeAssign(forInit);
    return this.finishNode(node2, "ConditionalExpression");
  }
  return expr;
};
pp$5.parseExprOps = function(forInit, refDestructuringErrors) {
  var startPos = this.start, startLoc = this.startLoc;
  var expr = this.parseMaybeUnary(refDestructuringErrors, false, false, forInit);
  if (this.checkExpressionErrors(refDestructuringErrors)) {
    return expr;
  }
  return expr.start === startPos && expr.type === "ArrowFunctionExpression" ? expr : this.parseExprOp(expr, startPos, startLoc, -1, forInit);
};
pp$5.parseExprOp = function(left, leftStartPos, leftStartLoc, minPrec, forInit) {
  var prec = this.type.binop;
  if (prec != null && (!forInit || this.type !== types$1._in)) {
    if (prec > minPrec) {
      var logical = this.type === types$1.logicalOR || this.type === types$1.logicalAND;
      var coalesce = this.type === types$1.coalesce;
      if (coalesce) {
        prec = types$1.logicalAND.binop;
      }
      var op = this.value;
      this.next();
      var startPos = this.start, startLoc = this.startLoc;
      var right = this.parseExprOp(this.parseMaybeUnary(null, false, false, forInit), startPos, startLoc, prec, forInit);
      var node2 = this.buildBinary(leftStartPos, leftStartLoc, left, right, op, logical || coalesce);
      if (logical && this.type === types$1.coalesce || coalesce && (this.type === types$1.logicalOR || this.type === types$1.logicalAND)) {
        this.raiseRecoverable(this.start, "Logical expressions and coalesce expressions cannot be mixed. Wrap either by parentheses");
      }
      return this.parseExprOp(node2, leftStartPos, leftStartLoc, minPrec, forInit);
    }
  }
  return left;
};
pp$5.buildBinary = function(startPos, startLoc, left, right, op, logical) {
  if (right.type === "PrivateIdentifier") {
    this.raise(right.start, "Private identifier can only be left side of binary expression");
  }
  var node2 = this.startNodeAt(startPos, startLoc);
  node2.left = left;
  node2.operator = op;
  node2.right = right;
  return this.finishNode(node2, logical ? "LogicalExpression" : "BinaryExpression");
};
pp$5.parseMaybeUnary = function(refDestructuringErrors, sawUnary, incDec, forInit) {
  var startPos = this.start, startLoc = this.startLoc, expr;
  if (this.isContextual("await") && this.canAwait) {
    expr = this.parseAwait(forInit);
    sawUnary = true;
  } else if (this.type.prefix) {
    var node2 = this.startNode(), update = this.type === types$1.incDec;
    node2.operator = this.value;
    node2.prefix = true;
    this.next();
    node2.argument = this.parseMaybeUnary(null, true, update, forInit);
    this.checkExpressionErrors(refDestructuringErrors, true);
    if (update) {
      this.checkLValSimple(node2.argument);
    } else if (this.strict && node2.operator === "delete" && isLocalVariableAccess(node2.argument)) {
      this.raiseRecoverable(node2.start, "Deleting local variable in strict mode");
    } else if (node2.operator === "delete" && isPrivateFieldAccess(node2.argument)) {
      this.raiseRecoverable(node2.start, "Private fields can not be deleted");
    } else {
      sawUnary = true;
    }
    expr = this.finishNode(node2, update ? "UpdateExpression" : "UnaryExpression");
  } else if (!sawUnary && this.type === types$1.privateId) {
    if ((forInit || this.privateNameStack.length === 0) && this.options.checkPrivateFields) {
      this.unexpected();
    }
    expr = this.parsePrivateIdent();
    if (this.type !== types$1._in) {
      this.unexpected();
    }
  } else {
    expr = this.parseExprSubscripts(refDestructuringErrors, forInit);
    if (this.checkExpressionErrors(refDestructuringErrors)) {
      return expr;
    }
    while (this.type.postfix && !this.canInsertSemicolon()) {
      var node$1 = this.startNodeAt(startPos, startLoc);
      node$1.operator = this.value;
      node$1.prefix = false;
      node$1.argument = expr;
      this.checkLValSimple(expr);
      this.next();
      expr = this.finishNode(node$1, "UpdateExpression");
    }
  }
  if (!incDec && this.eat(types$1.starstar)) {
    if (sawUnary) {
      this.unexpected(this.lastTokStart);
    } else {
      return this.buildBinary(startPos, startLoc, expr, this.parseMaybeUnary(null, false, false, forInit), "**", false);
    }
  } else {
    return expr;
  }
};
function isLocalVariableAccess(node2) {
  return node2.type === "Identifier" || node2.type === "ParenthesizedExpression" && isLocalVariableAccess(node2.expression);
}
function isPrivateFieldAccess(node2) {
  return node2.type === "MemberExpression" && node2.property.type === "PrivateIdentifier" || node2.type === "ChainExpression" && isPrivateFieldAccess(node2.expression) || node2.type === "ParenthesizedExpression" && isPrivateFieldAccess(node2.expression);
}
pp$5.parseExprSubscripts = function(refDestructuringErrors, forInit) {
  var startPos = this.start, startLoc = this.startLoc;
  var expr = this.parseExprAtom(refDestructuringErrors, forInit);
  if (expr.type === "ArrowFunctionExpression" && this.input.slice(this.lastTokStart, this.lastTokEnd) !== ")") {
    return expr;
  }
  var result = this.parseSubscripts(expr, startPos, startLoc, false, forInit);
  if (refDestructuringErrors && result.type === "MemberExpression") {
    if (refDestructuringErrors.parenthesizedAssign >= result.start) {
      refDestructuringErrors.parenthesizedAssign = -1;
    }
    if (refDestructuringErrors.parenthesizedBind >= result.start) {
      refDestructuringErrors.parenthesizedBind = -1;
    }
    if (refDestructuringErrors.trailingComma >= result.start) {
      refDestructuringErrors.trailingComma = -1;
    }
  }
  return result;
};
pp$5.parseSubscripts = function(base, startPos, startLoc, noCalls, forInit) {
  var maybeAsyncArrow = this.options.ecmaVersion >= 8 && base.type === "Identifier" && base.name === "async" && this.lastTokEnd === base.end && !this.canInsertSemicolon() && base.end - base.start === 5 && this.potentialArrowAt === base.start;
  var optionalChained = false;
  while (true) {
    var element = this.parseSubscript(base, startPos, startLoc, noCalls, maybeAsyncArrow, optionalChained, forInit);
    if (element.optional) {
      optionalChained = true;
    }
    if (element === base || element.type === "ArrowFunctionExpression") {
      if (optionalChained) {
        var chainNode = this.startNodeAt(startPos, startLoc);
        chainNode.expression = element;
        element = this.finishNode(chainNode, "ChainExpression");
      }
      return element;
    }
    base = element;
  }
};
pp$5.shouldParseAsyncArrow = function() {
  return !this.canInsertSemicolon() && this.eat(types$1.arrow);
};
pp$5.parseSubscriptAsyncArrow = function(startPos, startLoc, exprList, forInit) {
  return this.parseArrowExpression(this.startNodeAt(startPos, startLoc), exprList, true, forInit);
};
pp$5.parseSubscript = function(base, startPos, startLoc, noCalls, maybeAsyncArrow, optionalChained, forInit) {
  var optionalSupported = this.options.ecmaVersion >= 11;
  var optional = optionalSupported && this.eat(types$1.questionDot);
  if (noCalls && optional) {
    this.raise(this.lastTokStart, "Optional chaining cannot appear in the callee of new expressions");
  }
  var computed = this.eat(types$1.bracketL);
  if (computed || optional && this.type !== types$1.parenL && this.type !== types$1.backQuote || this.eat(types$1.dot)) {
    var node2 = this.startNodeAt(startPos, startLoc);
    node2.object = base;
    if (computed) {
      node2.property = this.parseExpression();
      this.expect(types$1.bracketR);
    } else if (this.type === types$1.privateId && base.type !== "Super") {
      node2.property = this.parsePrivateIdent();
    } else {
      node2.property = this.parseIdent(this.options.allowReserved !== "never");
    }
    node2.computed = !!computed;
    if (optionalSupported) {
      node2.optional = optional;
    }
    base = this.finishNode(node2, "MemberExpression");
  } else if (!noCalls && this.eat(types$1.parenL)) {
    var refDestructuringErrors = new DestructuringErrors(), oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;
    this.yieldPos = 0;
    this.awaitPos = 0;
    this.awaitIdentPos = 0;
    var exprList = this.parseExprList(types$1.parenR, this.options.ecmaVersion >= 8, false, refDestructuringErrors);
    if (maybeAsyncArrow && !optional && this.shouldParseAsyncArrow()) {
      this.checkPatternErrors(refDestructuringErrors, false);
      this.checkYieldAwaitInDefaultParams();
      if (this.awaitIdentPos > 0) {
        this.raise(this.awaitIdentPos, "Cannot use 'await' as identifier inside an async function");
      }
      this.yieldPos = oldYieldPos;
      this.awaitPos = oldAwaitPos;
      this.awaitIdentPos = oldAwaitIdentPos;
      return this.parseSubscriptAsyncArrow(startPos, startLoc, exprList, forInit);
    }
    this.checkExpressionErrors(refDestructuringErrors, true);
    this.yieldPos = oldYieldPos || this.yieldPos;
    this.awaitPos = oldAwaitPos || this.awaitPos;
    this.awaitIdentPos = oldAwaitIdentPos || this.awaitIdentPos;
    var node$1 = this.startNodeAt(startPos, startLoc);
    node$1.callee = base;
    node$1.arguments = exprList;
    if (optionalSupported) {
      node$1.optional = optional;
    }
    base = this.finishNode(node$1, "CallExpression");
  } else if (this.type === types$1.backQuote) {
    if (optional || optionalChained) {
      this.raise(this.start, "Optional chaining cannot appear in the tag of tagged template expressions");
    }
    var node$2 = this.startNodeAt(startPos, startLoc);
    node$2.tag = base;
    node$2.quasi = this.parseTemplate({ isTagged: true });
    base = this.finishNode(node$2, "TaggedTemplateExpression");
  }
  return base;
};
pp$5.parseExprAtom = function(refDestructuringErrors, forInit, forNew) {
  if (this.type === types$1.slash) {
    this.readRegexp();
  }
  var node2, canBeArrow = this.potentialArrowAt === this.start;
  switch (this.type) {
    case types$1._super:
      if (!this.allowSuper) {
        this.raise(this.start, "'super' keyword outside a method");
      }
      node2 = this.startNode();
      this.next();
      if (this.type === types$1.parenL && !this.allowDirectSuper) {
        this.raise(node2.start, "super() call outside constructor of a subclass");
      }
      if (this.type !== types$1.dot && this.type !== types$1.bracketL && this.type !== types$1.parenL) {
        this.unexpected();
      }
      return this.finishNode(node2, "Super");
    case types$1._this:
      node2 = this.startNode();
      this.next();
      return this.finishNode(node2, "ThisExpression");
    case types$1.name:
      var startPos = this.start, startLoc = this.startLoc, containsEsc = this.containsEsc;
      var id = this.parseIdent(false);
      if (this.options.ecmaVersion >= 8 && !containsEsc && id.name === "async" && !this.canInsertSemicolon() && this.eat(types$1._function)) {
        this.overrideContext(types.f_expr);
        return this.parseFunction(this.startNodeAt(startPos, startLoc), 0, false, true, forInit);
      }
      if (canBeArrow && !this.canInsertSemicolon()) {
        if (this.eat(types$1.arrow)) {
          return this.parseArrowExpression(this.startNodeAt(startPos, startLoc), [id], false, forInit);
        }
        if (this.options.ecmaVersion >= 8 && id.name === "async" && this.type === types$1.name && !containsEsc && (!this.potentialArrowInForAwait || this.value !== "of" || this.containsEsc)) {
          id = this.parseIdent(false);
          if (this.canInsertSemicolon() || !this.eat(types$1.arrow)) {
            this.unexpected();
          }
          return this.parseArrowExpression(this.startNodeAt(startPos, startLoc), [id], true, forInit);
        }
      }
      return id;
    case types$1.regexp:
      var value = this.value;
      node2 = this.parseLiteral(value.value);
      node2.regex = { pattern: value.pattern, flags: value.flags };
      return node2;
    case types$1.num:
    case types$1.string:
      return this.parseLiteral(this.value);
    case types$1._null:
    case types$1._true:
    case types$1._false:
      node2 = this.startNode();
      node2.value = this.type === types$1._null ? null : this.type === types$1._true;
      node2.raw = this.type.keyword;
      this.next();
      return this.finishNode(node2, "Literal");
    case types$1.parenL:
      var start = this.start, expr = this.parseParenAndDistinguishExpression(canBeArrow, forInit);
      if (refDestructuringErrors) {
        if (refDestructuringErrors.parenthesizedAssign < 0 && !this.isSimpleAssignTarget(expr)) {
          refDestructuringErrors.parenthesizedAssign = start;
        }
        if (refDestructuringErrors.parenthesizedBind < 0) {
          refDestructuringErrors.parenthesizedBind = start;
        }
      }
      return expr;
    case types$1.bracketL:
      node2 = this.startNode();
      this.next();
      node2.elements = this.parseExprList(types$1.bracketR, true, true, refDestructuringErrors);
      return this.finishNode(node2, "ArrayExpression");
    case types$1.braceL:
      this.overrideContext(types.b_expr);
      return this.parseObj(false, refDestructuringErrors);
    case types$1._function:
      node2 = this.startNode();
      this.next();
      return this.parseFunction(node2, 0);
    case types$1._class:
      return this.parseClass(this.startNode(), false);
    case types$1._new:
      return this.parseNew();
    case types$1.backQuote:
      return this.parseTemplate();
    case types$1._import:
      if (this.options.ecmaVersion >= 11) {
        return this.parseExprImport(forNew);
      } else {
        return this.unexpected();
      }
    default:
      return this.parseExprAtomDefault();
  }
};
pp$5.parseExprAtomDefault = function() {
  this.unexpected();
};
pp$5.parseExprImport = function(forNew) {
  var node2 = this.startNode();
  if (this.containsEsc) {
    this.raiseRecoverable(this.start, "Escape sequence in keyword import");
  }
  this.next();
  if (this.type === types$1.parenL && !forNew) {
    return this.parseDynamicImport(node2);
  } else if (this.type === types$1.dot) {
    var meta = this.startNodeAt(node2.start, node2.loc && node2.loc.start);
    meta.name = "import";
    node2.meta = this.finishNode(meta, "Identifier");
    return this.parseImportMeta(node2);
  } else {
    this.unexpected();
  }
};
pp$5.parseDynamicImport = function(node2) {
  this.next();
  node2.source = this.parseMaybeAssign();
  if (this.options.ecmaVersion >= 16) {
    if (!this.eat(types$1.parenR)) {
      this.expect(types$1.comma);
      if (!this.afterTrailingComma(types$1.parenR)) {
        node2.options = this.parseMaybeAssign();
        if (!this.eat(types$1.parenR)) {
          this.expect(types$1.comma);
          if (!this.afterTrailingComma(types$1.parenR)) {
            this.unexpected();
          }
        }
      } else {
        node2.options = null;
      }
    } else {
      node2.options = null;
    }
  } else {
    if (!this.eat(types$1.parenR)) {
      var errorPos = this.start;
      if (this.eat(types$1.comma) && this.eat(types$1.parenR)) {
        this.raiseRecoverable(errorPos, "Trailing comma is not allowed in import()");
      } else {
        this.unexpected(errorPos);
      }
    }
  }
  return this.finishNode(node2, "ImportExpression");
};
pp$5.parseImportMeta = function(node2) {
  this.next();
  var containsEsc = this.containsEsc;
  node2.property = this.parseIdent(true);
  if (node2.property.name !== "meta") {
    this.raiseRecoverable(node2.property.start, "The only valid meta property for import is 'import.meta'");
  }
  if (containsEsc) {
    this.raiseRecoverable(node2.start, "'import.meta' must not contain escaped characters");
  }
  if (this.options.sourceType !== "module" && !this.options.allowImportExportEverywhere) {
    this.raiseRecoverable(node2.start, "Cannot use 'import.meta' outside a module");
  }
  return this.finishNode(node2, "MetaProperty");
};
pp$5.parseLiteral = function(value) {
  var node2 = this.startNode();
  node2.value = value;
  node2.raw = this.input.slice(this.start, this.end);
  if (node2.raw.charCodeAt(node2.raw.length - 1) === 110) {
    node2.bigint = node2.value != null ? node2.value.toString() : node2.raw.slice(0, -1).replace(/_/g, "");
  }
  this.next();
  return this.finishNode(node2, "Literal");
};
pp$5.parseParenExpression = function() {
  this.expect(types$1.parenL);
  var val = this.parseExpression();
  this.expect(types$1.parenR);
  return val;
};
pp$5.shouldParseArrow = function(exprList) {
  return !this.canInsertSemicolon();
};
pp$5.parseParenAndDistinguishExpression = function(canBeArrow, forInit) {
  var startPos = this.start, startLoc = this.startLoc, val, allowTrailingComma = this.options.ecmaVersion >= 8;
  if (this.options.ecmaVersion >= 6) {
    this.next();
    var innerStartPos = this.start, innerStartLoc = this.startLoc;
    var exprList = [], first = true, lastIsComma = false;
    var refDestructuringErrors = new DestructuringErrors(), oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, spreadStart;
    this.yieldPos = 0;
    this.awaitPos = 0;
    while (this.type !== types$1.parenR) {
      first ? first = false : this.expect(types$1.comma);
      if (allowTrailingComma && this.afterTrailingComma(types$1.parenR, true)) {
        lastIsComma = true;
        break;
      } else if (this.type === types$1.ellipsis) {
        spreadStart = this.start;
        exprList.push(this.parseParenItem(this.parseRestBinding()));
        if (this.type === types$1.comma) {
          this.raiseRecoverable(
            this.start,
            "Comma is not permitted after the rest element"
          );
        }
        break;
      } else {
        exprList.push(this.parseMaybeAssign(false, refDestructuringErrors, this.parseParenItem));
      }
    }
    var innerEndPos = this.lastTokEnd, innerEndLoc = this.lastTokEndLoc;
    this.expect(types$1.parenR);
    if (canBeArrow && this.shouldParseArrow(exprList) && this.eat(types$1.arrow)) {
      this.checkPatternErrors(refDestructuringErrors, false);
      this.checkYieldAwaitInDefaultParams();
      this.yieldPos = oldYieldPos;
      this.awaitPos = oldAwaitPos;
      return this.parseParenArrowList(startPos, startLoc, exprList, forInit);
    }
    if (!exprList.length || lastIsComma) {
      this.unexpected(this.lastTokStart);
    }
    if (spreadStart) {
      this.unexpected(spreadStart);
    }
    this.checkExpressionErrors(refDestructuringErrors, true);
    this.yieldPos = oldYieldPos || this.yieldPos;
    this.awaitPos = oldAwaitPos || this.awaitPos;
    if (exprList.length > 1) {
      val = this.startNodeAt(innerStartPos, innerStartLoc);
      val.expressions = exprList;
      this.finishNodeAt(val, "SequenceExpression", innerEndPos, innerEndLoc);
    } else {
      val = exprList[0];
    }
  } else {
    val = this.parseParenExpression();
  }
  if (this.options.preserveParens) {
    var par = this.startNodeAt(startPos, startLoc);
    par.expression = val;
    return this.finishNode(par, "ParenthesizedExpression");
  } else {
    return val;
  }
};
pp$5.parseParenItem = function(item) {
  return item;
};
pp$5.parseParenArrowList = function(startPos, startLoc, exprList, forInit) {
  return this.parseArrowExpression(this.startNodeAt(startPos, startLoc), exprList, false, forInit);
};
var empty = [];
pp$5.parseNew = function() {
  if (this.containsEsc) {
    this.raiseRecoverable(this.start, "Escape sequence in keyword new");
  }
  var node2 = this.startNode();
  this.next();
  if (this.options.ecmaVersion >= 6 && this.type === types$1.dot) {
    var meta = this.startNodeAt(node2.start, node2.loc && node2.loc.start);
    meta.name = "new";
    node2.meta = this.finishNode(meta, "Identifier");
    this.next();
    var containsEsc = this.containsEsc;
    node2.property = this.parseIdent(true);
    if (node2.property.name !== "target") {
      this.raiseRecoverable(node2.property.start, "The only valid meta property for new is 'new.target'");
    }
    if (containsEsc) {
      this.raiseRecoverable(node2.start, "'new.target' must not contain escaped characters");
    }
    if (!this.allowNewDotTarget) {
      this.raiseRecoverable(node2.start, "'new.target' can only be used in functions and class static block");
    }
    return this.finishNode(node2, "MetaProperty");
  }
  var startPos = this.start, startLoc = this.startLoc;
  node2.callee = this.parseSubscripts(this.parseExprAtom(null, false, true), startPos, startLoc, true, false);
  if (node2.callee.type === "Super") {
    this.raiseRecoverable(startPos, "Invalid use of 'super'");
  }
  if (this.eat(types$1.parenL)) {
    node2.arguments = this.parseExprList(types$1.parenR, this.options.ecmaVersion >= 8, false);
  } else {
    node2.arguments = empty;
  }
  return this.finishNode(node2, "NewExpression");
};
pp$5.parseTemplateElement = function(ref2) {
  var isTagged = ref2.isTagged;
  var elem = this.startNode();
  if (this.type === types$1.invalidTemplate) {
    if (!isTagged) {
      this.raiseRecoverable(this.start, "Bad escape sequence in untagged template literal");
    }
    elem.value = {
      raw: this.value.replace(/\r\n?/g, "\n"),
      cooked: null
    };
  } else {
    elem.value = {
      raw: this.input.slice(this.start, this.end).replace(/\r\n?/g, "\n"),
      cooked: this.value
    };
  }
  this.next();
  elem.tail = this.type === types$1.backQuote;
  return this.finishNode(elem, "TemplateElement");
};
pp$5.parseTemplate = function(ref2) {
  if (ref2 === void 0) ref2 = {};
  var isTagged = ref2.isTagged;
  if (isTagged === void 0) isTagged = false;
  var node2 = this.startNode();
  this.next();
  node2.expressions = [];
  var curElt = this.parseTemplateElement({ isTagged });
  node2.quasis = [curElt];
  while (!curElt.tail) {
    if (this.type === types$1.eof) {
      this.raise(this.pos, "Unterminated template literal");
    }
    this.expect(types$1.dollarBraceL);
    node2.expressions.push(this.parseExpression());
    this.expect(types$1.braceR);
    node2.quasis.push(curElt = this.parseTemplateElement({ isTagged }));
  }
  this.next();
  return this.finishNode(node2, "TemplateLiteral");
};
pp$5.isAsyncProp = function(prop) {
  return !prop.computed && prop.key.type === "Identifier" && prop.key.name === "async" && (this.type === types$1.name || this.type === types$1.num || this.type === types$1.string || this.type === types$1.bracketL || this.type.keyword || this.options.ecmaVersion >= 9 && this.type === types$1.star) && !lineBreak.test(this.input.slice(this.lastTokEnd, this.start));
};
pp$5.parseObj = function(isPattern, refDestructuringErrors) {
  var node2 = this.startNode(), first = true, propHash = {};
  node2.properties = [];
  this.next();
  while (!this.eat(types$1.braceR)) {
    if (!first) {
      this.expect(types$1.comma);
      if (this.options.ecmaVersion >= 5 && this.afterTrailingComma(types$1.braceR)) {
        break;
      }
    } else {
      first = false;
    }
    var prop = this.parseProperty(isPattern, refDestructuringErrors);
    if (!isPattern) {
      this.checkPropClash(prop, propHash, refDestructuringErrors);
    }
    node2.properties.push(prop);
  }
  return this.finishNode(node2, isPattern ? "ObjectPattern" : "ObjectExpression");
};
pp$5.parseProperty = function(isPattern, refDestructuringErrors) {
  var prop = this.startNode(), isGenerator, isAsync, startPos, startLoc;
  if (this.options.ecmaVersion >= 9 && this.eat(types$1.ellipsis)) {
    if (isPattern) {
      prop.argument = this.parseIdent(false);
      if (this.type === types$1.comma) {
        this.raiseRecoverable(this.start, "Comma is not permitted after the rest element");
      }
      return this.finishNode(prop, "RestElement");
    }
    prop.argument = this.parseMaybeAssign(false, refDestructuringErrors);
    if (this.type === types$1.comma && refDestructuringErrors && refDestructuringErrors.trailingComma < 0) {
      refDestructuringErrors.trailingComma = this.start;
    }
    return this.finishNode(prop, "SpreadElement");
  }
  if (this.options.ecmaVersion >= 6) {
    prop.method = false;
    prop.shorthand = false;
    if (isPattern || refDestructuringErrors) {
      startPos = this.start;
      startLoc = this.startLoc;
    }
    if (!isPattern) {
      isGenerator = this.eat(types$1.star);
    }
  }
  var containsEsc = this.containsEsc;
  this.parsePropertyName(prop);
  if (!isPattern && !containsEsc && this.options.ecmaVersion >= 8 && !isGenerator && this.isAsyncProp(prop)) {
    isAsync = true;
    isGenerator = this.options.ecmaVersion >= 9 && this.eat(types$1.star);
    this.parsePropertyName(prop);
  } else {
    isAsync = false;
  }
  this.parsePropertyValue(prop, isPattern, isGenerator, isAsync, startPos, startLoc, refDestructuringErrors, containsEsc);
  return this.finishNode(prop, "Property");
};
pp$5.parseGetterSetter = function(prop) {
  var kind = prop.key.name;
  this.parsePropertyName(prop);
  prop.value = this.parseMethod(false);
  prop.kind = kind;
  var paramCount = prop.kind === "get" ? 0 : 1;
  if (prop.value.params.length !== paramCount) {
    var start = prop.value.start;
    if (prop.kind === "get") {
      this.raiseRecoverable(start, "getter should have no params");
    } else {
      this.raiseRecoverable(start, "setter should have exactly one param");
    }
  } else {
    if (prop.kind === "set" && prop.value.params[0].type === "RestElement") {
      this.raiseRecoverable(prop.value.params[0].start, "Setter cannot use rest params");
    }
  }
};
pp$5.parsePropertyValue = function(prop, isPattern, isGenerator, isAsync, startPos, startLoc, refDestructuringErrors, containsEsc) {
  if ((isGenerator || isAsync) && this.type === types$1.colon) {
    this.unexpected();
  }
  if (this.eat(types$1.colon)) {
    prop.value = isPattern ? this.parseMaybeDefault(this.start, this.startLoc) : this.parseMaybeAssign(false, refDestructuringErrors);
    prop.kind = "init";
  } else if (this.options.ecmaVersion >= 6 && this.type === types$1.parenL) {
    if (isPattern) {
      this.unexpected();
    }
    prop.method = true;
    prop.value = this.parseMethod(isGenerator, isAsync);
    prop.kind = "init";
  } else if (!isPattern && !containsEsc && this.options.ecmaVersion >= 5 && !prop.computed && prop.key.type === "Identifier" && (prop.key.name === "get" || prop.key.name === "set") && (this.type !== types$1.comma && this.type !== types$1.braceR && this.type !== types$1.eq)) {
    if (isGenerator || isAsync) {
      this.unexpected();
    }
    this.parseGetterSetter(prop);
  } else if (this.options.ecmaVersion >= 6 && !prop.computed && prop.key.type === "Identifier") {
    if (isGenerator || isAsync) {
      this.unexpected();
    }
    this.checkUnreserved(prop.key);
    if (prop.key.name === "await" && !this.awaitIdentPos) {
      this.awaitIdentPos = startPos;
    }
    if (isPattern) {
      prop.value = this.parseMaybeDefault(startPos, startLoc, this.copyNode(prop.key));
    } else if (this.type === types$1.eq && refDestructuringErrors) {
      if (refDestructuringErrors.shorthandAssign < 0) {
        refDestructuringErrors.shorthandAssign = this.start;
      }
      prop.value = this.parseMaybeDefault(startPos, startLoc, this.copyNode(prop.key));
    } else {
      prop.value = this.copyNode(prop.key);
    }
    prop.kind = "init";
    prop.shorthand = true;
  } else {
    this.unexpected();
  }
};
pp$5.parsePropertyName = function(prop) {
  if (this.options.ecmaVersion >= 6) {
    if (this.eat(types$1.bracketL)) {
      prop.computed = true;
      prop.key = this.parseMaybeAssign();
      this.expect(types$1.bracketR);
      return prop.key;
    } else {
      prop.computed = false;
    }
  }
  return prop.key = this.type === types$1.num || this.type === types$1.string ? this.parseExprAtom() : this.parseIdent(this.options.allowReserved !== "never");
};
pp$5.initFunction = function(node2) {
  node2.id = null;
  if (this.options.ecmaVersion >= 6) {
    node2.generator = node2.expression = false;
  }
  if (this.options.ecmaVersion >= 8) {
    node2.async = false;
  }
};
pp$5.parseMethod = function(isGenerator, isAsync, allowDirectSuper) {
  var node2 = this.startNode(), oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;
  this.initFunction(node2);
  if (this.options.ecmaVersion >= 6) {
    node2.generator = isGenerator;
  }
  if (this.options.ecmaVersion >= 8) {
    node2.async = !!isAsync;
  }
  this.yieldPos = 0;
  this.awaitPos = 0;
  this.awaitIdentPos = 0;
  this.enterScope(functionFlags(isAsync, node2.generator) | SCOPE_SUPER | (allowDirectSuper ? SCOPE_DIRECT_SUPER : 0));
  this.expect(types$1.parenL);
  node2.params = this.parseBindingList(types$1.parenR, false, this.options.ecmaVersion >= 8);
  this.checkYieldAwaitInDefaultParams();
  this.parseFunctionBody(node2, false, true, false);
  this.yieldPos = oldYieldPos;
  this.awaitPos = oldAwaitPos;
  this.awaitIdentPos = oldAwaitIdentPos;
  return this.finishNode(node2, "FunctionExpression");
};
pp$5.parseArrowExpression = function(node2, params, isAsync, forInit) {
  var oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;
  this.enterScope(functionFlags(isAsync, false) | SCOPE_ARROW);
  this.initFunction(node2);
  if (this.options.ecmaVersion >= 8) {
    node2.async = !!isAsync;
  }
  this.yieldPos = 0;
  this.awaitPos = 0;
  this.awaitIdentPos = 0;
  node2.params = this.toAssignableList(params, true);
  this.parseFunctionBody(node2, true, false, forInit);
  this.yieldPos = oldYieldPos;
  this.awaitPos = oldAwaitPos;
  this.awaitIdentPos = oldAwaitIdentPos;
  return this.finishNode(node2, "ArrowFunctionExpression");
};
pp$5.parseFunctionBody = function(node2, isArrowFunction, isMethod, forInit) {
  var isExpression = isArrowFunction && this.type !== types$1.braceL;
  var oldStrict = this.strict, useStrict = false;
  if (isExpression) {
    node2.body = this.parseMaybeAssign(forInit);
    node2.expression = true;
    this.checkParams(node2, false);
  } else {
    var nonSimple = this.options.ecmaVersion >= 7 && !this.isSimpleParamList(node2.params);
    if (!oldStrict || nonSimple) {
      useStrict = this.strictDirective(this.end);
      if (useStrict && nonSimple) {
        this.raiseRecoverable(node2.start, "Illegal 'use strict' directive in function with non-simple parameter list");
      }
    }
    var oldLabels = this.labels;
    this.labels = [];
    if (useStrict) {
      this.strict = true;
    }
    this.checkParams(node2, !oldStrict && !useStrict && !isArrowFunction && !isMethod && this.isSimpleParamList(node2.params));
    if (this.strict && node2.id) {
      this.checkLValSimple(node2.id, BIND_OUTSIDE);
    }
    node2.body = this.parseBlock(false, void 0, useStrict && !oldStrict);
    node2.expression = false;
    this.adaptDirectivePrologue(node2.body.body);
    this.labels = oldLabels;
  }
  this.exitScope();
};
pp$5.isSimpleParamList = function(params) {
  for (var i2 = 0, list2 = params; i2 < list2.length; i2 += 1) {
    var param = list2[i2];
    if (param.type !== "Identifier") {
      return false;
    }
  }
  return true;
};
pp$5.checkParams = function(node2, allowDuplicates) {
  var nameHash = /* @__PURE__ */ Object.create(null);
  for (var i2 = 0, list2 = node2.params; i2 < list2.length; i2 += 1) {
    var param = list2[i2];
    this.checkLValInnerPattern(param, BIND_VAR, allowDuplicates ? null : nameHash);
  }
};
pp$5.parseExprList = function(close, allowTrailingComma, allowEmpty, refDestructuringErrors) {
  var elts = [], first = true;
  while (!this.eat(close)) {
    if (!first) {
      this.expect(types$1.comma);
      if (allowTrailingComma && this.afterTrailingComma(close)) {
        break;
      }
    } else {
      first = false;
    }
    var elt = void 0;
    if (allowEmpty && this.type === types$1.comma) {
      elt = null;
    } else if (this.type === types$1.ellipsis) {
      elt = this.parseSpread(refDestructuringErrors);
      if (refDestructuringErrors && this.type === types$1.comma && refDestructuringErrors.trailingComma < 0) {
        refDestructuringErrors.trailingComma = this.start;
      }
    } else {
      elt = this.parseMaybeAssign(false, refDestructuringErrors);
    }
    elts.push(elt);
  }
  return elts;
};
pp$5.checkUnreserved = function(ref2) {
  var start = ref2.start;
  var end = ref2.end;
  var name = ref2.name;
  if (this.inGenerator && name === "yield") {
    this.raiseRecoverable(start, "Cannot use 'yield' as identifier inside a generator");
  }
  if (this.inAsync && name === "await") {
    this.raiseRecoverable(start, "Cannot use 'await' as identifier inside an async function");
  }
  if (!(this.currentThisScope().flags & SCOPE_VAR) && name === "arguments") {
    this.raiseRecoverable(start, "Cannot use 'arguments' in class field initializer");
  }
  if (this.inClassStaticBlock && (name === "arguments" || name === "await")) {
    this.raise(start, "Cannot use " + name + " in class static initialization block");
  }
  if (this.keywords.test(name)) {
    this.raise(start, "Unexpected keyword '" + name + "'");
  }
  if (this.options.ecmaVersion < 6 && this.input.slice(start, end).indexOf("\\") !== -1) {
    return;
  }
  var re = this.strict ? this.reservedWordsStrict : this.reservedWords;
  if (re.test(name)) {
    if (!this.inAsync && name === "await") {
      this.raiseRecoverable(start, "Cannot use keyword 'await' outside an async function");
    }
    this.raiseRecoverable(start, "The keyword '" + name + "' is reserved");
  }
};
pp$5.parseIdent = function(liberal) {
  var node2 = this.parseIdentNode();
  this.next(!!liberal);
  this.finishNode(node2, "Identifier");
  if (!liberal) {
    this.checkUnreserved(node2);
    if (node2.name === "await" && !this.awaitIdentPos) {
      this.awaitIdentPos = node2.start;
    }
  }
  return node2;
};
pp$5.parseIdentNode = function() {
  var node2 = this.startNode();
  if (this.type === types$1.name) {
    node2.name = this.value;
  } else if (this.type.keyword) {
    node2.name = this.type.keyword;
    if ((node2.name === "class" || node2.name === "function") && (this.lastTokEnd !== this.lastTokStart + 1 || this.input.charCodeAt(this.lastTokStart) !== 46)) {
      this.context.pop();
    }
    this.type = types$1.name;
  } else {
    this.unexpected();
  }
  return node2;
};
pp$5.parsePrivateIdent = function() {
  var node2 = this.startNode();
  if (this.type === types$1.privateId) {
    node2.name = this.value;
  } else {
    this.unexpected();
  }
  this.next();
  this.finishNode(node2, "PrivateIdentifier");
  if (this.options.checkPrivateFields) {
    if (this.privateNameStack.length === 0) {
      this.raise(node2.start, "Private field '#" + node2.name + "' must be declared in an enclosing class");
    } else {
      this.privateNameStack[this.privateNameStack.length - 1].used.push(node2);
    }
  }
  return node2;
};
pp$5.parseYield = function(forInit) {
  if (!this.yieldPos) {
    this.yieldPos = this.start;
  }
  var node2 = this.startNode();
  this.next();
  if (this.type === types$1.semi || this.canInsertSemicolon() || this.type !== types$1.star && !this.type.startsExpr) {
    node2.delegate = false;
    node2.argument = null;
  } else {
    node2.delegate = this.eat(types$1.star);
    node2.argument = this.parseMaybeAssign(forInit);
  }
  return this.finishNode(node2, "YieldExpression");
};
pp$5.parseAwait = function(forInit) {
  if (!this.awaitPos) {
    this.awaitPos = this.start;
  }
  var node2 = this.startNode();
  this.next();
  node2.argument = this.parseMaybeUnary(null, true, false, forInit);
  return this.finishNode(node2, "AwaitExpression");
};
var pp$4 = Parser.prototype;
pp$4.raise = function(pos, message) {
  var loc = getLineInfo(this.input, pos);
  message += " (" + loc.line + ":" + loc.column + ")";
  if (this.sourceFile) {
    message += " in " + this.sourceFile;
  }
  var err = new SyntaxError(message);
  err.pos = pos;
  err.loc = loc;
  err.raisedAt = this.pos;
  throw err;
};
pp$4.raiseRecoverable = pp$4.raise;
pp$4.curPosition = function() {
  if (this.options.locations) {
    return new Position(this.curLine, this.pos - this.lineStart);
  }
};
var pp$3 = Parser.prototype;
var Scope = function Scope2(flags) {
  this.flags = flags;
  this.var = [];
  this.lexical = [];
  this.functions = [];
};
pp$3.enterScope = function(flags) {
  this.scopeStack.push(new Scope(flags));
};
pp$3.exitScope = function() {
  this.scopeStack.pop();
};
pp$3.treatFunctionsAsVarInScope = function(scope) {
  return scope.flags & SCOPE_FUNCTION || !this.inModule && scope.flags & SCOPE_TOP;
};
pp$3.declareName = function(name, bindingType, pos) {
  var redeclared = false;
  if (bindingType === BIND_LEXICAL) {
    var scope = this.currentScope();
    redeclared = scope.lexical.indexOf(name) > -1 || scope.functions.indexOf(name) > -1 || scope.var.indexOf(name) > -1;
    scope.lexical.push(name);
    if (this.inModule && scope.flags & SCOPE_TOP) {
      delete this.undefinedExports[name];
    }
  } else if (bindingType === BIND_SIMPLE_CATCH) {
    var scope$1 = this.currentScope();
    scope$1.lexical.push(name);
  } else if (bindingType === BIND_FUNCTION) {
    var scope$2 = this.currentScope();
    if (this.treatFunctionsAsVar) {
      redeclared = scope$2.lexical.indexOf(name) > -1;
    } else {
      redeclared = scope$2.lexical.indexOf(name) > -1 || scope$2.var.indexOf(name) > -1;
    }
    scope$2.functions.push(name);
  } else {
    for (var i2 = this.scopeStack.length - 1; i2 >= 0; --i2) {
      var scope$3 = this.scopeStack[i2];
      if (scope$3.lexical.indexOf(name) > -1 && !(scope$3.flags & SCOPE_SIMPLE_CATCH && scope$3.lexical[0] === name) || !this.treatFunctionsAsVarInScope(scope$3) && scope$3.functions.indexOf(name) > -1) {
        redeclared = true;
        break;
      }
      scope$3.var.push(name);
      if (this.inModule && scope$3.flags & SCOPE_TOP) {
        delete this.undefinedExports[name];
      }
      if (scope$3.flags & SCOPE_VAR) {
        break;
      }
    }
  }
  if (redeclared) {
    this.raiseRecoverable(pos, "Identifier '" + name + "' has already been declared");
  }
};
pp$3.checkLocalExport = function(id) {
  if (this.scopeStack[0].lexical.indexOf(id.name) === -1 && this.scopeStack[0].var.indexOf(id.name) === -1) {
    this.undefinedExports[id.name] = id;
  }
};
pp$3.currentScope = function() {
  return this.scopeStack[this.scopeStack.length - 1];
};
pp$3.currentVarScope = function() {
  for (var i2 = this.scopeStack.length - 1; ; i2--) {
    var scope = this.scopeStack[i2];
    if (scope.flags & (SCOPE_VAR | SCOPE_CLASS_FIELD_INIT | SCOPE_CLASS_STATIC_BLOCK)) {
      return scope;
    }
  }
};
pp$3.currentThisScope = function() {
  for (var i2 = this.scopeStack.length - 1; ; i2--) {
    var scope = this.scopeStack[i2];
    if (scope.flags & (SCOPE_VAR | SCOPE_CLASS_FIELD_INIT | SCOPE_CLASS_STATIC_BLOCK) && !(scope.flags & SCOPE_ARROW)) {
      return scope;
    }
  }
};
var Node = function Node2(parser, pos, loc) {
  this.type = "";
  this.start = pos;
  this.end = 0;
  if (parser.options.locations) {
    this.loc = new SourceLocation(parser, loc);
  }
  if (parser.options.directSourceFile) {
    this.sourceFile = parser.options.directSourceFile;
  }
  if (parser.options.ranges) {
    this.range = [pos, 0];
  }
};
var pp$2 = Parser.prototype;
pp$2.startNode = function() {
  return new Node(this, this.start, this.startLoc);
};
pp$2.startNodeAt = function(pos, loc) {
  return new Node(this, pos, loc);
};
function finishNodeAt(node2, type, pos, loc) {
  node2.type = type;
  node2.end = pos;
  if (this.options.locations) {
    node2.loc.end = loc;
  }
  if (this.options.ranges) {
    node2.range[1] = pos;
  }
  return node2;
}
pp$2.finishNode = function(node2, type) {
  return finishNodeAt.call(this, node2, type, this.lastTokEnd, this.lastTokEndLoc);
};
pp$2.finishNodeAt = function(node2, type, pos, loc) {
  return finishNodeAt.call(this, node2, type, pos, loc);
};
pp$2.copyNode = function(node2) {
  var newNode = new Node(this, node2.start, this.startLoc);
  for (var prop in node2) {
    newNode[prop] = node2[prop];
  }
  return newNode;
};
var scriptValuesAddedInUnicode = "Berf Beria_Erfe Gara Garay Gukh Gurung_Khema Hrkt Katakana_Or_Hiragana Kawi Kirat_Rai Krai Nag_Mundari Nagm Ol_Onal Onao Sidetic Sidt Sunu Sunuwar Tai_Yo Tayo Todhri Todr Tolong_Siki Tols Tulu_Tigalari Tutg Unknown Zzzz";
var ecma9BinaryProperties = "ASCII ASCII_Hex_Digit AHex Alphabetic Alpha Any Assigned Bidi_Control Bidi_C Bidi_Mirrored Bidi_M Case_Ignorable CI Cased Changes_When_Casefolded CWCF Changes_When_Casemapped CWCM Changes_When_Lowercased CWL Changes_When_NFKC_Casefolded CWKCF Changes_When_Titlecased CWT Changes_When_Uppercased CWU Dash Default_Ignorable_Code_Point DI Deprecated Dep Diacritic Dia Emoji Emoji_Component Emoji_Modifier Emoji_Modifier_Base Emoji_Presentation Extender Ext Grapheme_Base Gr_Base Grapheme_Extend Gr_Ext Hex_Digit Hex IDS_Binary_Operator IDSB IDS_Trinary_Operator IDST ID_Continue IDC ID_Start IDS Ideographic Ideo Join_Control Join_C Logical_Order_Exception LOE Lowercase Lower Math Noncharacter_Code_Point NChar Pattern_Syntax Pat_Syn Pattern_White_Space Pat_WS Quotation_Mark QMark Radical Regional_Indicator RI Sentence_Terminal STerm Soft_Dotted SD Terminal_Punctuation Term Unified_Ideograph UIdeo Uppercase Upper Variation_Selector VS White_Space space XID_Continue XIDC XID_Start XIDS";
var ecma10BinaryProperties = ecma9BinaryProperties + " Extended_Pictographic";
var ecma11BinaryProperties = ecma10BinaryProperties;
var ecma12BinaryProperties = ecma11BinaryProperties + " EBase EComp EMod EPres ExtPict";
var ecma13BinaryProperties = ecma12BinaryProperties;
var ecma14BinaryProperties = ecma13BinaryProperties;
var unicodeBinaryProperties = {
  9: ecma9BinaryProperties,
  10: ecma10BinaryProperties,
  11: ecma11BinaryProperties,
  12: ecma12BinaryProperties,
  13: ecma13BinaryProperties,
  14: ecma14BinaryProperties
};
var ecma14BinaryPropertiesOfStrings = "Basic_Emoji Emoji_Keycap_Sequence RGI_Emoji_Modifier_Sequence RGI_Emoji_Flag_Sequence RGI_Emoji_Tag_Sequence RGI_Emoji_ZWJ_Sequence RGI_Emoji";
var unicodeBinaryPropertiesOfStrings = {
  9: "",
  10: "",
  11: "",
  12: "",
  13: "",
  14: ecma14BinaryPropertiesOfStrings
};
var unicodeGeneralCategoryValues = "Cased_Letter LC Close_Punctuation Pe Connector_Punctuation Pc Control Cc cntrl Currency_Symbol Sc Dash_Punctuation Pd Decimal_Number Nd digit Enclosing_Mark Me Final_Punctuation Pf Format Cf Initial_Punctuation Pi Letter L Letter_Number Nl Line_Separator Zl Lowercase_Letter Ll Mark M Combining_Mark Math_Symbol Sm Modifier_Letter Lm Modifier_Symbol Sk Nonspacing_Mark Mn Number N Open_Punctuation Ps Other C Other_Letter Lo Other_Number No Other_Punctuation Po Other_Symbol So Paragraph_Separator Zp Private_Use Co Punctuation P punct Separator Z Space_Separator Zs Spacing_Mark Mc Surrogate Cs Symbol S Titlecase_Letter Lt Unassigned Cn Uppercase_Letter Lu";
var ecma9ScriptValues = "Adlam Adlm Ahom Anatolian_Hieroglyphs Hluw Arabic Arab Armenian Armn Avestan Avst Balinese Bali Bamum Bamu Bassa_Vah Bass Batak Batk Bengali Beng Bhaiksuki Bhks Bopomofo Bopo Brahmi Brah Braille Brai Buginese Bugi Buhid Buhd Canadian_Aboriginal Cans Carian Cari Caucasian_Albanian Aghb Chakma Cakm Cham Cham Cherokee Cher Common Zyyy Coptic Copt Qaac Cuneiform Xsux Cypriot Cprt Cyrillic Cyrl Deseret Dsrt Devanagari Deva Duployan Dupl Egyptian_Hieroglyphs Egyp Elbasan Elba Ethiopic Ethi Georgian Geor Glagolitic Glag Gothic Goth Grantha Gran Greek Grek Gujarati Gujr Gurmukhi Guru Han Hani Hangul Hang Hanunoo Hano Hatran Hatr Hebrew Hebr Hiragana Hira Imperial_Aramaic Armi Inherited Zinh Qaai Inscriptional_Pahlavi Phli Inscriptional_Parthian Prti Javanese Java Kaithi Kthi Kannada Knda Katakana Kana Kayah_Li Kali Kharoshthi Khar Khmer Khmr Khojki Khoj Khudawadi Sind Lao Laoo Latin Latn Lepcha Lepc Limbu Limb Linear_A Lina Linear_B Linb Lisu Lisu Lycian Lyci Lydian Lydi Mahajani Mahj Malayalam Mlym Mandaic Mand Manichaean Mani Marchen Marc Masaram_Gondi Gonm Meetei_Mayek Mtei Mende_Kikakui Mend Meroitic_Cursive Merc Meroitic_Hieroglyphs Mero Miao Plrd Modi Mongolian Mong Mro Mroo Multani Mult Myanmar Mymr Nabataean Nbat New_Tai_Lue Talu Newa Newa Nko Nkoo Nushu Nshu Ogham Ogam Ol_Chiki Olck Old_Hungarian Hung Old_Italic Ital Old_North_Arabian Narb Old_Permic Perm Old_Persian Xpeo Old_South_Arabian Sarb Old_Turkic Orkh Oriya Orya Osage Osge Osmanya Osma Pahawh_Hmong Hmng Palmyrene Palm Pau_Cin_Hau Pauc Phags_Pa Phag Phoenician Phnx Psalter_Pahlavi Phlp Rejang Rjng Runic Runr Samaritan Samr Saurashtra Saur Sharada Shrd Shavian Shaw Siddham Sidd SignWriting Sgnw Sinhala Sinh Sora_Sompeng Sora Soyombo Soyo Sundanese Sund Syloti_Nagri Sylo Syriac Syrc Tagalog Tglg Tagbanwa Tagb Tai_Le Tale Tai_Tham Lana Tai_Viet Tavt Takri Takr Tamil Taml Tangut Tang Telugu Telu Thaana Thaa Thai Thai Tibetan Tibt Tifinagh Tfng Tirhuta Tirh Ugaritic Ugar Vai Vaii Warang_Citi Wara Yi Yiii Zanabazar_Square Zanb";
var ecma10ScriptValues = ecma9ScriptValues + " Dogra Dogr Gunjala_Gondi Gong Hanifi_Rohingya Rohg Makasar Maka Medefaidrin Medf Old_Sogdian Sogo Sogdian Sogd";
var ecma11ScriptValues = ecma10ScriptValues + " Elymaic Elym Nandinagari Nand Nyiakeng_Puachue_Hmong Hmnp Wancho Wcho";
var ecma12ScriptValues = ecma11ScriptValues + " Chorasmian Chrs Diak Dives_Akuru Khitan_Small_Script Kits Yezi Yezidi";
var ecma13ScriptValues = ecma12ScriptValues + " Cypro_Minoan Cpmn Old_Uyghur Ougr Tangsa Tnsa Toto Vithkuqi Vith";
var ecma14ScriptValues = ecma13ScriptValues + " " + scriptValuesAddedInUnicode;
var unicodeScriptValues = {
  9: ecma9ScriptValues,
  10: ecma10ScriptValues,
  11: ecma11ScriptValues,
  12: ecma12ScriptValues,
  13: ecma13ScriptValues,
  14: ecma14ScriptValues
};
var data = {};
function buildUnicodeData(ecmaVersion2) {
  var d = data[ecmaVersion2] = {
    binary: wordsRegexp(unicodeBinaryProperties[ecmaVersion2] + " " + unicodeGeneralCategoryValues),
    binaryOfStrings: wordsRegexp(unicodeBinaryPropertiesOfStrings[ecmaVersion2]),
    nonBinary: {
      General_Category: wordsRegexp(unicodeGeneralCategoryValues),
      Script: wordsRegexp(unicodeScriptValues[ecmaVersion2])
    }
  };
  d.nonBinary.Script_Extensions = d.nonBinary.Script;
  d.nonBinary.gc = d.nonBinary.General_Category;
  d.nonBinary.sc = d.nonBinary.Script;
  d.nonBinary.scx = d.nonBinary.Script_Extensions;
}
for (i = 0, list = [9, 10, 11, 12, 13, 14]; i < list.length; i += 1) {
  ecmaVersion = list[i];
  buildUnicodeData(ecmaVersion);
}
var ecmaVersion;
var i;
var list;
var pp$1 = Parser.prototype;
var BranchID = function BranchID2(parent, base) {
  this.parent = parent;
  this.base = base || this;
};
BranchID.prototype.separatedFrom = function separatedFrom(alt) {
  for (var self = this; self; self = self.parent) {
    for (var other = alt; other; other = other.parent) {
      if (self.base === other.base && self !== other) {
        return true;
      }
    }
  }
  return false;
};
BranchID.prototype.sibling = function sibling() {
  return new BranchID(this.parent, this.base);
};
var RegExpValidationState = function RegExpValidationState2(parser) {
  this.parser = parser;
  this.validFlags = "gim" + (parser.options.ecmaVersion >= 6 ? "uy" : "") + (parser.options.ecmaVersion >= 9 ? "s" : "") + (parser.options.ecmaVersion >= 13 ? "d" : "") + (parser.options.ecmaVersion >= 15 ? "v" : "");
  this.unicodeProperties = data[parser.options.ecmaVersion >= 14 ? 14 : parser.options.ecmaVersion];
  this.source = "";
  this.flags = "";
  this.start = 0;
  this.switchU = false;
  this.switchV = false;
  this.switchN = false;
  this.pos = 0;
  this.lastIntValue = 0;
  this.lastStringValue = "";
  this.lastAssertionIsQuantifiable = false;
  this.numCapturingParens = 0;
  this.maxBackReference = 0;
  this.groupNames = /* @__PURE__ */ Object.create(null);
  this.backReferenceNames = [];
  this.branchID = null;
};
RegExpValidationState.prototype.reset = function reset(start, pattern, flags) {
  var unicodeSets = flags.indexOf("v") !== -1;
  var unicode = flags.indexOf("u") !== -1;
  this.start = start | 0;
  this.source = pattern + "";
  this.flags = flags;
  if (unicodeSets && this.parser.options.ecmaVersion >= 15) {
    this.switchU = true;
    this.switchV = true;
    this.switchN = true;
  } else {
    this.switchU = unicode && this.parser.options.ecmaVersion >= 6;
    this.switchV = false;
    this.switchN = unicode && this.parser.options.ecmaVersion >= 9;
  }
};
RegExpValidationState.prototype.raise = function raise(message) {
  this.parser.raiseRecoverable(this.start, "Invalid regular expression: /" + this.source + "/: " + message);
};
RegExpValidationState.prototype.at = function at(i2, forceU) {
  if (forceU === void 0) forceU = false;
  var s = this.source;
  var l = s.length;
  if (i2 >= l) {
    return -1;
  }
  var c = s.charCodeAt(i2);
  if (!(forceU || this.switchU) || c <= 55295 || c >= 57344 || i2 + 1 >= l) {
    return c;
  }
  var next = s.charCodeAt(i2 + 1);
  return next >= 56320 && next <= 57343 ? (c << 10) + next - 56613888 : c;
};
RegExpValidationState.prototype.nextIndex = function nextIndex(i2, forceU) {
  if (forceU === void 0) forceU = false;
  var s = this.source;
  var l = s.length;
  if (i2 >= l) {
    return l;
  }
  var c = s.charCodeAt(i2), next;
  if (!(forceU || this.switchU) || c <= 55295 || c >= 57344 || i2 + 1 >= l || (next = s.charCodeAt(i2 + 1)) < 56320 || next > 57343) {
    return i2 + 1;
  }
  return i2 + 2;
};
RegExpValidationState.prototype.current = function current(forceU) {
  if (forceU === void 0) forceU = false;
  return this.at(this.pos, forceU);
};
RegExpValidationState.prototype.lookahead = function lookahead(forceU) {
  if (forceU === void 0) forceU = false;
  return this.at(this.nextIndex(this.pos, forceU), forceU);
};
RegExpValidationState.prototype.advance = function advance(forceU) {
  if (forceU === void 0) forceU = false;
  this.pos = this.nextIndex(this.pos, forceU);
};
RegExpValidationState.prototype.eat = function eat(ch, forceU) {
  if (forceU === void 0) forceU = false;
  if (this.current(forceU) === ch) {
    this.advance(forceU);
    return true;
  }
  return false;
};
RegExpValidationState.prototype.eatChars = function eatChars(chs, forceU) {
  if (forceU === void 0) forceU = false;
  var pos = this.pos;
  for (var i2 = 0, list2 = chs; i2 < list2.length; i2 += 1) {
    var ch = list2[i2];
    var current2 = this.at(pos, forceU);
    if (current2 === -1 || current2 !== ch) {
      return false;
    }
    pos = this.nextIndex(pos, forceU);
  }
  this.pos = pos;
  return true;
};
pp$1.validateRegExpFlags = function(state) {
  var validFlags = state.validFlags;
  var flags = state.flags;
  var u = false;
  var v = false;
  for (var i2 = 0; i2 < flags.length; i2++) {
    var flag = flags.charAt(i2);
    if (validFlags.indexOf(flag) === -1) {
      this.raise(state.start, "Invalid regular expression flag");
    }
    if (flags.indexOf(flag, i2 + 1) > -1) {
      this.raise(state.start, "Duplicate regular expression flag");
    }
    if (flag === "u") {
      u = true;
    }
    if (flag === "v") {
      v = true;
    }
  }
  if (this.options.ecmaVersion >= 15 && u && v) {
    this.raise(state.start, "Invalid regular expression flag");
  }
};
function hasProp(obj) {
  for (var _ in obj) {
    return true;
  }
  return false;
}
pp$1.validateRegExpPattern = function(state) {
  this.regexp_pattern(state);
  if (!state.switchN && this.options.ecmaVersion >= 9 && hasProp(state.groupNames)) {
    state.switchN = true;
    this.regexp_pattern(state);
  }
};
pp$1.regexp_pattern = function(state) {
  state.pos = 0;
  state.lastIntValue = 0;
  state.lastStringValue = "";
  state.lastAssertionIsQuantifiable = false;
  state.numCapturingParens = 0;
  state.maxBackReference = 0;
  state.groupNames = /* @__PURE__ */ Object.create(null);
  state.backReferenceNames.length = 0;
  state.branchID = null;
  this.regexp_disjunction(state);
  if (state.pos !== state.source.length) {
    if (state.eat(
      41
      /* ) */
    )) {
      state.raise("Unmatched ')'");
    }
    if (state.eat(
      93
      /* ] */
    ) || state.eat(
      125
      /* } */
    )) {
      state.raise("Lone quantifier brackets");
    }
  }
  if (state.maxBackReference > state.numCapturingParens) {
    state.raise("Invalid escape");
  }
  for (var i2 = 0, list2 = state.backReferenceNames; i2 < list2.length; i2 += 1) {
    var name = list2[i2];
    if (!state.groupNames[name]) {
      state.raise("Invalid named capture referenced");
    }
  }
};
pp$1.regexp_disjunction = function(state) {
  var trackDisjunction = this.options.ecmaVersion >= 16;
  if (trackDisjunction) {
    state.branchID = new BranchID(state.branchID, null);
  }
  this.regexp_alternative(state);
  while (state.eat(
    124
    /* | */
  )) {
    if (trackDisjunction) {
      state.branchID = state.branchID.sibling();
    }
    this.regexp_alternative(state);
  }
  if (trackDisjunction) {
    state.branchID = state.branchID.parent;
  }
  if (this.regexp_eatQuantifier(state, true)) {
    state.raise("Nothing to repeat");
  }
  if (state.eat(
    123
    /* { */
  )) {
    state.raise("Lone quantifier brackets");
  }
};
pp$1.regexp_alternative = function(state) {
  while (state.pos < state.source.length && this.regexp_eatTerm(state)) {
  }
};
pp$1.regexp_eatTerm = function(state) {
  if (this.regexp_eatAssertion(state)) {
    if (state.lastAssertionIsQuantifiable && this.regexp_eatQuantifier(state)) {
      if (state.switchU) {
        state.raise("Invalid quantifier");
      }
    }
    return true;
  }
  if (state.switchU ? this.regexp_eatAtom(state) : this.regexp_eatExtendedAtom(state)) {
    this.regexp_eatQuantifier(state);
    return true;
  }
  return false;
};
pp$1.regexp_eatAssertion = function(state) {
  var start = state.pos;
  state.lastAssertionIsQuantifiable = false;
  if (state.eat(
    94
    /* ^ */
  ) || state.eat(
    36
    /* $ */
  )) {
    return true;
  }
  if (state.eat(
    92
    /* \ */
  )) {
    if (state.eat(
      66
      /* B */
    ) || state.eat(
      98
      /* b */
    )) {
      return true;
    }
    state.pos = start;
  }
  if (state.eat(
    40
    /* ( */
  ) && state.eat(
    63
    /* ? */
  )) {
    var lookbehind = false;
    if (this.options.ecmaVersion >= 9) {
      lookbehind = state.eat(
        60
        /* < */
      );
    }
    if (state.eat(
      61
      /* = */
    ) || state.eat(
      33
      /* ! */
    )) {
      this.regexp_disjunction(state);
      if (!state.eat(
        41
        /* ) */
      )) {
        state.raise("Unterminated group");
      }
      state.lastAssertionIsQuantifiable = !lookbehind;
      return true;
    }
  }
  state.pos = start;
  return false;
};
pp$1.regexp_eatQuantifier = function(state, noError) {
  if (noError === void 0) noError = false;
  if (this.regexp_eatQuantifierPrefix(state, noError)) {
    state.eat(
      63
      /* ? */
    );
    return true;
  }
  return false;
};
pp$1.regexp_eatQuantifierPrefix = function(state, noError) {
  return state.eat(
    42
    /* * */
  ) || state.eat(
    43
    /* + */
  ) || state.eat(
    63
    /* ? */
  ) || this.regexp_eatBracedQuantifier(state, noError);
};
pp$1.regexp_eatBracedQuantifier = function(state, noError) {
  var start = state.pos;
  if (state.eat(
    123
    /* { */
  )) {
    var min = 0, max = -1;
    if (this.regexp_eatDecimalDigits(state)) {
      min = state.lastIntValue;
      if (state.eat(
        44
        /* , */
      ) && this.regexp_eatDecimalDigits(state)) {
        max = state.lastIntValue;
      }
      if (state.eat(
        125
        /* } */
      )) {
        if (max !== -1 && max < min && !noError) {
          state.raise("numbers out of order in {} quantifier");
        }
        return true;
      }
    }
    if (state.switchU && !noError) {
      state.raise("Incomplete quantifier");
    }
    state.pos = start;
  }
  return false;
};
pp$1.regexp_eatAtom = function(state) {
  return this.regexp_eatPatternCharacters(state) || state.eat(
    46
    /* . */
  ) || this.regexp_eatReverseSolidusAtomEscape(state) || this.regexp_eatCharacterClass(state) || this.regexp_eatUncapturingGroup(state) || this.regexp_eatCapturingGroup(state);
};
pp$1.regexp_eatReverseSolidusAtomEscape = function(state) {
  var start = state.pos;
  if (state.eat(
    92
    /* \ */
  )) {
    if (this.regexp_eatAtomEscape(state)) {
      return true;
    }
    state.pos = start;
  }
  return false;
};
pp$1.regexp_eatUncapturingGroup = function(state) {
  var start = state.pos;
  if (state.eat(
    40
    /* ( */
  )) {
    if (state.eat(
      63
      /* ? */
    )) {
      if (this.options.ecmaVersion >= 16) {
        var addModifiers = this.regexp_eatModifiers(state);
        var hasHyphen = state.eat(
          45
          /* - */
        );
        if (addModifiers || hasHyphen) {
          for (var i2 = 0; i2 < addModifiers.length; i2++) {
            var modifier = addModifiers.charAt(i2);
            if (addModifiers.indexOf(modifier, i2 + 1) > -1) {
              state.raise("Duplicate regular expression modifiers");
            }
          }
          if (hasHyphen) {
            var removeModifiers = this.regexp_eatModifiers(state);
            if (!addModifiers && !removeModifiers && state.current() === 58) {
              state.raise("Invalid regular expression modifiers");
            }
            for (var i$1 = 0; i$1 < removeModifiers.length; i$1++) {
              var modifier$1 = removeModifiers.charAt(i$1);
              if (removeModifiers.indexOf(modifier$1, i$1 + 1) > -1 || addModifiers.indexOf(modifier$1) > -1) {
                state.raise("Duplicate regular expression modifiers");
              }
            }
          }
        }
      }
      if (state.eat(
        58
        /* : */
      )) {
        this.regexp_disjunction(state);
        if (state.eat(
          41
          /* ) */
        )) {
          return true;
        }
        state.raise("Unterminated group");
      }
    }
    state.pos = start;
  }
  return false;
};
pp$1.regexp_eatCapturingGroup = function(state) {
  if (state.eat(
    40
    /* ( */
  )) {
    if (this.options.ecmaVersion >= 9) {
      this.regexp_groupSpecifier(state);
    } else if (state.current() === 63) {
      state.raise("Invalid group");
    }
    this.regexp_disjunction(state);
    if (state.eat(
      41
      /* ) */
    )) {
      state.numCapturingParens += 1;
      return true;
    }
    state.raise("Unterminated group");
  }
  return false;
};
pp$1.regexp_eatModifiers = function(state) {
  var modifiers = "";
  var ch = 0;
  while ((ch = state.current()) !== -1 && isRegularExpressionModifier(ch)) {
    modifiers += codePointToString(ch);
    state.advance();
  }
  return modifiers;
};
function isRegularExpressionModifier(ch) {
  return ch === 105 || ch === 109 || ch === 115;
}
pp$1.regexp_eatExtendedAtom = function(state) {
  return state.eat(
    46
    /* . */
  ) || this.regexp_eatReverseSolidusAtomEscape(state) || this.regexp_eatCharacterClass(state) || this.regexp_eatUncapturingGroup(state) || this.regexp_eatCapturingGroup(state) || this.regexp_eatInvalidBracedQuantifier(state) || this.regexp_eatExtendedPatternCharacter(state);
};
pp$1.regexp_eatInvalidBracedQuantifier = function(state) {
  if (this.regexp_eatBracedQuantifier(state, true)) {
    state.raise("Nothing to repeat");
  }
  return false;
};
pp$1.regexp_eatSyntaxCharacter = function(state) {
  var ch = state.current();
  if (isSyntaxCharacter(ch)) {
    state.lastIntValue = ch;
    state.advance();
    return true;
  }
  return false;
};
function isSyntaxCharacter(ch) {
  return ch === 36 || ch >= 40 && ch <= 43 || ch === 46 || ch === 63 || ch >= 91 && ch <= 94 || ch >= 123 && ch <= 125;
}
pp$1.regexp_eatPatternCharacters = function(state) {
  var start = state.pos;
  var ch = 0;
  while ((ch = state.current()) !== -1 && !isSyntaxCharacter(ch)) {
    state.advance();
  }
  return state.pos !== start;
};
pp$1.regexp_eatExtendedPatternCharacter = function(state) {
  var ch = state.current();
  if (ch !== -1 && ch !== 36 && !(ch >= 40 && ch <= 43) && ch !== 46 && ch !== 63 && ch !== 91 && ch !== 94 && ch !== 124) {
    state.advance();
    return true;
  }
  return false;
};
pp$1.regexp_groupSpecifier = function(state) {
  if (state.eat(
    63
    /* ? */
  )) {
    if (!this.regexp_eatGroupName(state)) {
      state.raise("Invalid group");
    }
    var trackDisjunction = this.options.ecmaVersion >= 16;
    var known = state.groupNames[state.lastStringValue];
    if (known) {
      if (trackDisjunction) {
        for (var i2 = 0, list2 = known; i2 < list2.length; i2 += 1) {
          var altID = list2[i2];
          if (!altID.separatedFrom(state.branchID)) {
            state.raise("Duplicate capture group name");
          }
        }
      } else {
        state.raise("Duplicate capture group name");
      }
    }
    if (trackDisjunction) {
      (known || (state.groupNames[state.lastStringValue] = [])).push(state.branchID);
    } else {
      state.groupNames[state.lastStringValue] = true;
    }
  }
};
pp$1.regexp_eatGroupName = function(state) {
  state.lastStringValue = "";
  if (state.eat(
    60
    /* < */
  )) {
    if (this.regexp_eatRegExpIdentifierName(state) && state.eat(
      62
      /* > */
    )) {
      return true;
    }
    state.raise("Invalid capture group name");
  }
  return false;
};
pp$1.regexp_eatRegExpIdentifierName = function(state) {
  state.lastStringValue = "";
  if (this.regexp_eatRegExpIdentifierStart(state)) {
    state.lastStringValue += codePointToString(state.lastIntValue);
    while (this.regexp_eatRegExpIdentifierPart(state)) {
      state.lastStringValue += codePointToString(state.lastIntValue);
    }
    return true;
  }
  return false;
};
pp$1.regexp_eatRegExpIdentifierStart = function(state) {
  var start = state.pos;
  var forceU = this.options.ecmaVersion >= 11;
  var ch = state.current(forceU);
  state.advance(forceU);
  if (ch === 92 && this.regexp_eatRegExpUnicodeEscapeSequence(state, forceU)) {
    ch = state.lastIntValue;
  }
  if (isRegExpIdentifierStart(ch)) {
    state.lastIntValue = ch;
    return true;
  }
  state.pos = start;
  return false;
};
function isRegExpIdentifierStart(ch) {
  return isIdentifierStart(ch, true) || ch === 36 || ch === 95;
}
pp$1.regexp_eatRegExpIdentifierPart = function(state) {
  var start = state.pos;
  var forceU = this.options.ecmaVersion >= 11;
  var ch = state.current(forceU);
  state.advance(forceU);
  if (ch === 92 && this.regexp_eatRegExpUnicodeEscapeSequence(state, forceU)) {
    ch = state.lastIntValue;
  }
  if (isRegExpIdentifierPart(ch)) {
    state.lastIntValue = ch;
    return true;
  }
  state.pos = start;
  return false;
};
function isRegExpIdentifierPart(ch) {
  return isIdentifierChar(ch, true) || ch === 36 || ch === 95 || ch === 8204 || ch === 8205;
}
pp$1.regexp_eatAtomEscape = function(state) {
  if (this.regexp_eatBackReference(state) || this.regexp_eatCharacterClassEscape(state) || this.regexp_eatCharacterEscape(state) || state.switchN && this.regexp_eatKGroupName(state)) {
    return true;
  }
  if (state.switchU) {
    if (state.current() === 99) {
      state.raise("Invalid unicode escape");
    }
    state.raise("Invalid escape");
  }
  return false;
};
pp$1.regexp_eatBackReference = function(state) {
  var start = state.pos;
  if (this.regexp_eatDecimalEscape(state)) {
    var n = state.lastIntValue;
    if (state.switchU) {
      if (n > state.maxBackReference) {
        state.maxBackReference = n;
      }
      return true;
    }
    if (n <= state.numCapturingParens) {
      return true;
    }
    state.pos = start;
  }
  return false;
};
pp$1.regexp_eatKGroupName = function(state) {
  if (state.eat(
    107
    /* k */
  )) {
    if (this.regexp_eatGroupName(state)) {
      state.backReferenceNames.push(state.lastStringValue);
      return true;
    }
    state.raise("Invalid named reference");
  }
  return false;
};
pp$1.regexp_eatCharacterEscape = function(state) {
  return this.regexp_eatControlEscape(state) || this.regexp_eatCControlLetter(state) || this.regexp_eatZero(state) || this.regexp_eatHexEscapeSequence(state) || this.regexp_eatRegExpUnicodeEscapeSequence(state, false) || !state.switchU && this.regexp_eatLegacyOctalEscapeSequence(state) || this.regexp_eatIdentityEscape(state);
};
pp$1.regexp_eatCControlLetter = function(state) {
  var start = state.pos;
  if (state.eat(
    99
    /* c */
  )) {
    if (this.regexp_eatControlLetter(state)) {
      return true;
    }
    state.pos = start;
  }
  return false;
};
pp$1.regexp_eatZero = function(state) {
  if (state.current() === 48 && !isDecimalDigit(state.lookahead())) {
    state.lastIntValue = 0;
    state.advance();
    return true;
  }
  return false;
};
pp$1.regexp_eatControlEscape = function(state) {
  var ch = state.current();
  if (ch === 116) {
    state.lastIntValue = 9;
    state.advance();
    return true;
  }
  if (ch === 110) {
    state.lastIntValue = 10;
    state.advance();
    return true;
  }
  if (ch === 118) {
    state.lastIntValue = 11;
    state.advance();
    return true;
  }
  if (ch === 102) {
    state.lastIntValue = 12;
    state.advance();
    return true;
  }
  if (ch === 114) {
    state.lastIntValue = 13;
    state.advance();
    return true;
  }
  return false;
};
pp$1.regexp_eatControlLetter = function(state) {
  var ch = state.current();
  if (isControlLetter(ch)) {
    state.lastIntValue = ch % 32;
    state.advance();
    return true;
  }
  return false;
};
function isControlLetter(ch) {
  return ch >= 65 && ch <= 90 || ch >= 97 && ch <= 122;
}
pp$1.regexp_eatRegExpUnicodeEscapeSequence = function(state, forceU) {
  if (forceU === void 0) forceU = false;
  var start = state.pos;
  var switchU = forceU || state.switchU;
  if (state.eat(
    117
    /* u */
  )) {
    if (this.regexp_eatFixedHexDigits(state, 4)) {
      var lead = state.lastIntValue;
      if (switchU && lead >= 55296 && lead <= 56319) {
        var leadSurrogateEnd = state.pos;
        if (state.eat(
          92
          /* \ */
        ) && state.eat(
          117
          /* u */
        ) && this.regexp_eatFixedHexDigits(state, 4)) {
          var trail = state.lastIntValue;
          if (trail >= 56320 && trail <= 57343) {
            state.lastIntValue = (lead - 55296) * 1024 + (trail - 56320) + 65536;
            return true;
          }
        }
        state.pos = leadSurrogateEnd;
        state.lastIntValue = lead;
      }
      return true;
    }
    if (switchU && state.eat(
      123
      /* { */
    ) && this.regexp_eatHexDigits(state) && state.eat(
      125
      /* } */
    ) && isValidUnicode(state.lastIntValue)) {
      return true;
    }
    if (switchU) {
      state.raise("Invalid unicode escape");
    }
    state.pos = start;
  }
  return false;
};
function isValidUnicode(ch) {
  return ch >= 0 && ch <= 1114111;
}
pp$1.regexp_eatIdentityEscape = function(state) {
  if (state.switchU) {
    if (this.regexp_eatSyntaxCharacter(state)) {
      return true;
    }
    if (state.eat(
      47
      /* / */
    )) {
      state.lastIntValue = 47;
      return true;
    }
    return false;
  }
  var ch = state.current();
  if (ch !== 99 && (!state.switchN || ch !== 107)) {
    state.lastIntValue = ch;
    state.advance();
    return true;
  }
  return false;
};
pp$1.regexp_eatDecimalEscape = function(state) {
  state.lastIntValue = 0;
  var ch = state.current();
  if (ch >= 49 && ch <= 57) {
    do {
      state.lastIntValue = 10 * state.lastIntValue + (ch - 48);
      state.advance();
    } while ((ch = state.current()) >= 48 && ch <= 57);
    return true;
  }
  return false;
};
var CharSetNone = 0;
var CharSetOk = 1;
var CharSetString = 2;
pp$1.regexp_eatCharacterClassEscape = function(state) {
  var ch = state.current();
  if (isCharacterClassEscape(ch)) {
    state.lastIntValue = -1;
    state.advance();
    return CharSetOk;
  }
  var negate = false;
  if (state.switchU && this.options.ecmaVersion >= 9 && ((negate = ch === 80) || ch === 112)) {
    state.lastIntValue = -1;
    state.advance();
    var result;
    if (state.eat(
      123
      /* { */
    ) && (result = this.regexp_eatUnicodePropertyValueExpression(state)) && state.eat(
      125
      /* } */
    )) {
      if (negate && result === CharSetString) {
        state.raise("Invalid property name");
      }
      return result;
    }
    state.raise("Invalid property name");
  }
  return CharSetNone;
};
function isCharacterClassEscape(ch) {
  return ch === 100 || ch === 68 || ch === 115 || ch === 83 || ch === 119 || ch === 87;
}
pp$1.regexp_eatUnicodePropertyValueExpression = function(state) {
  var start = state.pos;
  if (this.regexp_eatUnicodePropertyName(state) && state.eat(
    61
    /* = */
  )) {
    var name = state.lastStringValue;
    if (this.regexp_eatUnicodePropertyValue(state)) {
      var value = state.lastStringValue;
      this.regexp_validateUnicodePropertyNameAndValue(state, name, value);
      return CharSetOk;
    }
  }
  state.pos = start;
  if (this.regexp_eatLoneUnicodePropertyNameOrValue(state)) {
    var nameOrValue = state.lastStringValue;
    return this.regexp_validateUnicodePropertyNameOrValue(state, nameOrValue);
  }
  return CharSetNone;
};
pp$1.regexp_validateUnicodePropertyNameAndValue = function(state, name, value) {
  if (!hasOwn(state.unicodeProperties.nonBinary, name)) {
    state.raise("Invalid property name");
  }
  if (!state.unicodeProperties.nonBinary[name].test(value)) {
    state.raise("Invalid property value");
  }
};
pp$1.regexp_validateUnicodePropertyNameOrValue = function(state, nameOrValue) {
  if (state.unicodeProperties.binary.test(nameOrValue)) {
    return CharSetOk;
  }
  if (state.switchV && state.unicodeProperties.binaryOfStrings.test(nameOrValue)) {
    return CharSetString;
  }
  state.raise("Invalid property name");
};
pp$1.regexp_eatUnicodePropertyName = function(state) {
  var ch = 0;
  state.lastStringValue = "";
  while (isUnicodePropertyNameCharacter(ch = state.current())) {
    state.lastStringValue += codePointToString(ch);
    state.advance();
  }
  return state.lastStringValue !== "";
};
function isUnicodePropertyNameCharacter(ch) {
  return isControlLetter(ch) || ch === 95;
}
pp$1.regexp_eatUnicodePropertyValue = function(state) {
  var ch = 0;
  state.lastStringValue = "";
  while (isUnicodePropertyValueCharacter(ch = state.current())) {
    state.lastStringValue += codePointToString(ch);
    state.advance();
  }
  return state.lastStringValue !== "";
};
function isUnicodePropertyValueCharacter(ch) {
  return isUnicodePropertyNameCharacter(ch) || isDecimalDigit(ch);
}
pp$1.regexp_eatLoneUnicodePropertyNameOrValue = function(state) {
  return this.regexp_eatUnicodePropertyValue(state);
};
pp$1.regexp_eatCharacterClass = function(state) {
  if (state.eat(
    91
    /* [ */
  )) {
    var negate = state.eat(
      94
      /* ^ */
    );
    var result = this.regexp_classContents(state);
    if (!state.eat(
      93
      /* ] */
    )) {
      state.raise("Unterminated character class");
    }
    if (negate && result === CharSetString) {
      state.raise("Negated character class may contain strings");
    }
    return true;
  }
  return false;
};
pp$1.regexp_classContents = function(state) {
  if (state.current() === 93) {
    return CharSetOk;
  }
  if (state.switchV) {
    return this.regexp_classSetExpression(state);
  }
  this.regexp_nonEmptyClassRanges(state);
  return CharSetOk;
};
pp$1.regexp_nonEmptyClassRanges = function(state) {
  while (this.regexp_eatClassAtom(state)) {
    var left = state.lastIntValue;
    if (state.eat(
      45
      /* - */
    ) && this.regexp_eatClassAtom(state)) {
      var right = state.lastIntValue;
      if (state.switchU && (left === -1 || right === -1)) {
        state.raise("Invalid character class");
      }
      if (left !== -1 && right !== -1 && left > right) {
        state.raise("Range out of order in character class");
      }
    }
  }
};
pp$1.regexp_eatClassAtom = function(state) {
  var start = state.pos;
  if (state.eat(
    92
    /* \ */
  )) {
    if (this.regexp_eatClassEscape(state)) {
      return true;
    }
    if (state.switchU) {
      var ch$1 = state.current();
      if (ch$1 === 99 || isOctalDigit(ch$1)) {
        state.raise("Invalid class escape");
      }
      state.raise("Invalid escape");
    }
    state.pos = start;
  }
  var ch = state.current();
  if (ch !== 93) {
    state.lastIntValue = ch;
    state.advance();
    return true;
  }
  return false;
};
pp$1.regexp_eatClassEscape = function(state) {
  var start = state.pos;
  if (state.eat(
    98
    /* b */
  )) {
    state.lastIntValue = 8;
    return true;
  }
  if (state.switchU && state.eat(
    45
    /* - */
  )) {
    state.lastIntValue = 45;
    return true;
  }
  if (!state.switchU && state.eat(
    99
    /* c */
  )) {
    if (this.regexp_eatClassControlLetter(state)) {
      return true;
    }
    state.pos = start;
  }
  return this.regexp_eatCharacterClassEscape(state) || this.regexp_eatCharacterEscape(state);
};
pp$1.regexp_classSetExpression = function(state) {
  var result = CharSetOk, subResult;
  if (this.regexp_eatClassSetRange(state)) ;
  else if (subResult = this.regexp_eatClassSetOperand(state)) {
    if (subResult === CharSetString) {
      result = CharSetString;
    }
    var start = state.pos;
    while (state.eatChars(
      [38, 38]
      /* && */
    )) {
      if (state.current() !== 38 && (subResult = this.regexp_eatClassSetOperand(state))) {
        if (subResult !== CharSetString) {
          result = CharSetOk;
        }
        continue;
      }
      state.raise("Invalid character in character class");
    }
    if (start !== state.pos) {
      return result;
    }
    while (state.eatChars(
      [45, 45]
      /* -- */
    )) {
      if (this.regexp_eatClassSetOperand(state)) {
        continue;
      }
      state.raise("Invalid character in character class");
    }
    if (start !== state.pos) {
      return result;
    }
  } else {
    state.raise("Invalid character in character class");
  }
  for (; ; ) {
    if (this.regexp_eatClassSetRange(state)) {
      continue;
    }
    subResult = this.regexp_eatClassSetOperand(state);
    if (!subResult) {
      return result;
    }
    if (subResult === CharSetString) {
      result = CharSetString;
    }
  }
};
pp$1.regexp_eatClassSetRange = function(state) {
  var start = state.pos;
  if (this.regexp_eatClassSetCharacter(state)) {
    var left = state.lastIntValue;
    if (state.eat(
      45
      /* - */
    ) && this.regexp_eatClassSetCharacter(state)) {
      var right = state.lastIntValue;
      if (left !== -1 && right !== -1 && left > right) {
        state.raise("Range out of order in character class");
      }
      return true;
    }
    state.pos = start;
  }
  return false;
};
pp$1.regexp_eatClassSetOperand = function(state) {
  if (this.regexp_eatClassSetCharacter(state)) {
    return CharSetOk;
  }
  return this.regexp_eatClassStringDisjunction(state) || this.regexp_eatNestedClass(state);
};
pp$1.regexp_eatNestedClass = function(state) {
  var start = state.pos;
  if (state.eat(
    91
    /* [ */
  )) {
    var negate = state.eat(
      94
      /* ^ */
    );
    var result = this.regexp_classContents(state);
    if (state.eat(
      93
      /* ] */
    )) {
      if (negate && result === CharSetString) {
        state.raise("Negated character class may contain strings");
      }
      return result;
    }
    state.pos = start;
  }
  if (state.eat(
    92
    /* \ */
  )) {
    var result$1 = this.regexp_eatCharacterClassEscape(state);
    if (result$1) {
      return result$1;
    }
    state.pos = start;
  }
  return null;
};
pp$1.regexp_eatClassStringDisjunction = function(state) {
  var start = state.pos;
  if (state.eatChars(
    [92, 113]
    /* \q */
  )) {
    if (state.eat(
      123
      /* { */
    )) {
      var result = this.regexp_classStringDisjunctionContents(state);
      if (state.eat(
        125
        /* } */
      )) {
        return result;
      }
    } else {
      state.raise("Invalid escape");
    }
    state.pos = start;
  }
  return null;
};
pp$1.regexp_classStringDisjunctionContents = function(state) {
  var result = this.regexp_classString(state);
  while (state.eat(
    124
    /* | */
  )) {
    if (this.regexp_classString(state) === CharSetString) {
      result = CharSetString;
    }
  }
  return result;
};
pp$1.regexp_classString = function(state) {
  var count = 0;
  while (this.regexp_eatClassSetCharacter(state)) {
    count++;
  }
  return count === 1 ? CharSetOk : CharSetString;
};
pp$1.regexp_eatClassSetCharacter = function(state) {
  var start = state.pos;
  if (state.eat(
    92
    /* \ */
  )) {
    if (this.regexp_eatCharacterEscape(state) || this.regexp_eatClassSetReservedPunctuator(state)) {
      return true;
    }
    if (state.eat(
      98
      /* b */
    )) {
      state.lastIntValue = 8;
      return true;
    }
    state.pos = start;
    return false;
  }
  var ch = state.current();
  if (ch < 0 || ch === state.lookahead() && isClassSetReservedDoublePunctuatorCharacter(ch)) {
    return false;
  }
  if (isClassSetSyntaxCharacter(ch)) {
    return false;
  }
  state.advance();
  state.lastIntValue = ch;
  return true;
};
function isClassSetReservedDoublePunctuatorCharacter(ch) {
  return ch === 33 || ch >= 35 && ch <= 38 || ch >= 42 && ch <= 44 || ch === 46 || ch >= 58 && ch <= 64 || ch === 94 || ch === 96 || ch === 126;
}
function isClassSetSyntaxCharacter(ch) {
  return ch === 40 || ch === 41 || ch === 45 || ch === 47 || ch >= 91 && ch <= 93 || ch >= 123 && ch <= 125;
}
pp$1.regexp_eatClassSetReservedPunctuator = function(state) {
  var ch = state.current();
  if (isClassSetReservedPunctuator(ch)) {
    state.lastIntValue = ch;
    state.advance();
    return true;
  }
  return false;
};
function isClassSetReservedPunctuator(ch) {
  return ch === 33 || ch === 35 || ch === 37 || ch === 38 || ch === 44 || ch === 45 || ch >= 58 && ch <= 62 || ch === 64 || ch === 96 || ch === 126;
}
pp$1.regexp_eatClassControlLetter = function(state) {
  var ch = state.current();
  if (isDecimalDigit(ch) || ch === 95) {
    state.lastIntValue = ch % 32;
    state.advance();
    return true;
  }
  return false;
};
pp$1.regexp_eatHexEscapeSequence = function(state) {
  var start = state.pos;
  if (state.eat(
    120
    /* x */
  )) {
    if (this.regexp_eatFixedHexDigits(state, 2)) {
      return true;
    }
    if (state.switchU) {
      state.raise("Invalid escape");
    }
    state.pos = start;
  }
  return false;
};
pp$1.regexp_eatDecimalDigits = function(state) {
  var start = state.pos;
  var ch = 0;
  state.lastIntValue = 0;
  while (isDecimalDigit(ch = state.current())) {
    state.lastIntValue = 10 * state.lastIntValue + (ch - 48);
    state.advance();
  }
  return state.pos !== start;
};
function isDecimalDigit(ch) {
  return ch >= 48 && ch <= 57;
}
pp$1.regexp_eatHexDigits = function(state) {
  var start = state.pos;
  var ch = 0;
  state.lastIntValue = 0;
  while (isHexDigit(ch = state.current())) {
    state.lastIntValue = 16 * state.lastIntValue + hexToInt(ch);
    state.advance();
  }
  return state.pos !== start;
};
function isHexDigit(ch) {
  return ch >= 48 && ch <= 57 || ch >= 65 && ch <= 70 || ch >= 97 && ch <= 102;
}
function hexToInt(ch) {
  if (ch >= 65 && ch <= 70) {
    return 10 + (ch - 65);
  }
  if (ch >= 97 && ch <= 102) {
    return 10 + (ch - 97);
  }
  return ch - 48;
}
pp$1.regexp_eatLegacyOctalEscapeSequence = function(state) {
  if (this.regexp_eatOctalDigit(state)) {
    var n1 = state.lastIntValue;
    if (this.regexp_eatOctalDigit(state)) {
      var n2 = state.lastIntValue;
      if (n1 <= 3 && this.regexp_eatOctalDigit(state)) {
        state.lastIntValue = n1 * 64 + n2 * 8 + state.lastIntValue;
      } else {
        state.lastIntValue = n1 * 8 + n2;
      }
    } else {
      state.lastIntValue = n1;
    }
    return true;
  }
  return false;
};
pp$1.regexp_eatOctalDigit = function(state) {
  var ch = state.current();
  if (isOctalDigit(ch)) {
    state.lastIntValue = ch - 48;
    state.advance();
    return true;
  }
  state.lastIntValue = 0;
  return false;
};
function isOctalDigit(ch) {
  return ch >= 48 && ch <= 55;
}
pp$1.regexp_eatFixedHexDigits = function(state, length) {
  var start = state.pos;
  state.lastIntValue = 0;
  for (var i2 = 0; i2 < length; ++i2) {
    var ch = state.current();
    if (!isHexDigit(ch)) {
      state.pos = start;
      return false;
    }
    state.lastIntValue = 16 * state.lastIntValue + hexToInt(ch);
    state.advance();
  }
  return true;
};
var Token = function Token2(p) {
  this.type = p.type;
  this.value = p.value;
  this.start = p.start;
  this.end = p.end;
  if (p.options.locations) {
    this.loc = new SourceLocation(p, p.startLoc, p.endLoc);
  }
  if (p.options.ranges) {
    this.range = [p.start, p.end];
  }
};
var pp = Parser.prototype;
pp.next = function(ignoreEscapeSequenceInKeyword) {
  if (!ignoreEscapeSequenceInKeyword && this.type.keyword && this.containsEsc) {
    this.raiseRecoverable(this.start, "Escape sequence in keyword " + this.type.keyword);
  }
  if (this.options.onToken) {
    this.options.onToken(new Token(this));
  }
  this.lastTokEnd = this.end;
  this.lastTokStart = this.start;
  this.lastTokEndLoc = this.endLoc;
  this.lastTokStartLoc = this.startLoc;
  this.nextToken();
};
pp.getToken = function() {
  this.next();
  return new Token(this);
};
if (typeof Symbol !== "undefined") {
  pp[Symbol.iterator] = function() {
    var this$1$1 = this;
    return {
      next: function() {
        var token = this$1$1.getToken();
        return {
          done: token.type === types$1.eof,
          value: token
        };
      }
    };
  };
}
pp.nextToken = function() {
  var curContext = this.curContext();
  if (!curContext || !curContext.preserveSpace) {
    this.skipSpace();
  }
  this.start = this.pos;
  if (this.options.locations) {
    this.startLoc = this.curPosition();
  }
  if (this.pos >= this.input.length) {
    return this.finishToken(types$1.eof);
  }
  if (curContext.override) {
    return curContext.override(this);
  } else {
    this.readToken(this.fullCharCodeAtPos());
  }
};
pp.readToken = function(code) {
  if (isIdentifierStart(code, this.options.ecmaVersion >= 6) || code === 92) {
    return this.readWord();
  }
  return this.getTokenFromCode(code);
};
pp.fullCharCodeAt = function(pos) {
  var code = this.input.charCodeAt(pos);
  if (code <= 55295 || code >= 56320) {
    return code;
  }
  var next = this.input.charCodeAt(pos + 1);
  return next <= 56319 || next >= 57344 ? code : (code << 10) + next - 56613888;
};
pp.fullCharCodeAtPos = function() {
  return this.fullCharCodeAt(this.pos);
};
pp.skipBlockComment = function() {
  var startLoc = this.options.onComment && this.curPosition();
  var start = this.pos, end = this.input.indexOf("*/", this.pos += 2);
  if (end === -1) {
    this.raise(this.pos - 2, "Unterminated comment");
  }
  this.pos = end + 2;
  if (this.options.locations) {
    for (var nextBreak = void 0, pos = start; (nextBreak = nextLineBreak(this.input, pos, this.pos)) > -1; ) {
      ++this.curLine;
      pos = this.lineStart = nextBreak;
    }
  }
  if (this.options.onComment) {
    this.options.onComment(
      true,
      this.input.slice(start + 2, end),
      start,
      this.pos,
      startLoc,
      this.curPosition()
    );
  }
};
pp.skipLineComment = function(startSkip) {
  var start = this.pos;
  var startLoc = this.options.onComment && this.curPosition();
  var ch = this.input.charCodeAt(this.pos += startSkip);
  while (this.pos < this.input.length && !isNewLine(ch)) {
    ch = this.input.charCodeAt(++this.pos);
  }
  if (this.options.onComment) {
    this.options.onComment(
      false,
      this.input.slice(start + startSkip, this.pos),
      start,
      this.pos,
      startLoc,
      this.curPosition()
    );
  }
};
pp.skipSpace = function() {
  loop: while (this.pos < this.input.length) {
    var ch = this.input.charCodeAt(this.pos);
    switch (ch) {
      case 32:
      case 160:
        ++this.pos;
        break;
      case 13:
        if (this.input.charCodeAt(this.pos + 1) === 10) {
          ++this.pos;
        }
      case 10:
      case 8232:
      case 8233:
        ++this.pos;
        if (this.options.locations) {
          ++this.curLine;
          this.lineStart = this.pos;
        }
        break;
      case 47:
        switch (this.input.charCodeAt(this.pos + 1)) {
          case 42:
            this.skipBlockComment();
            break;
          case 47:
            this.skipLineComment(2);
            break;
          default:
            break loop;
        }
        break;
      default:
        if (ch > 8 && ch < 14 || ch >= 5760 && nonASCIIwhitespace.test(String.fromCharCode(ch))) {
          ++this.pos;
        } else {
          break loop;
        }
    }
  }
};
pp.finishToken = function(type, val) {
  this.end = this.pos;
  if (this.options.locations) {
    this.endLoc = this.curPosition();
  }
  var prevType = this.type;
  this.type = type;
  this.value = val;
  this.updateContext(prevType);
};
pp.readToken_dot = function() {
  var next = this.input.charCodeAt(this.pos + 1);
  if (next >= 48 && next <= 57) {
    return this.readNumber(true);
  }
  var next2 = this.input.charCodeAt(this.pos + 2);
  if (this.options.ecmaVersion >= 6 && next === 46 && next2 === 46) {
    this.pos += 3;
    return this.finishToken(types$1.ellipsis);
  } else {
    ++this.pos;
    return this.finishToken(types$1.dot);
  }
};
pp.readToken_slash = function() {
  var next = this.input.charCodeAt(this.pos + 1);
  if (this.exprAllowed) {
    ++this.pos;
    return this.readRegexp();
  }
  if (next === 61) {
    return this.finishOp(types$1.assign, 2);
  }
  return this.finishOp(types$1.slash, 1);
};
pp.readToken_mult_modulo_exp = function(code) {
  var next = this.input.charCodeAt(this.pos + 1);
  var size = 1;
  var tokentype = code === 42 ? types$1.star : types$1.modulo;
  if (this.options.ecmaVersion >= 7 && code === 42 && next === 42) {
    ++size;
    tokentype = types$1.starstar;
    next = this.input.charCodeAt(this.pos + 2);
  }
  if (next === 61) {
    return this.finishOp(types$1.assign, size + 1);
  }
  return this.finishOp(tokentype, size);
};
pp.readToken_pipe_amp = function(code) {
  var next = this.input.charCodeAt(this.pos + 1);
  if (next === code) {
    if (this.options.ecmaVersion >= 12) {
      var next2 = this.input.charCodeAt(this.pos + 2);
      if (next2 === 61) {
        return this.finishOp(types$1.assign, 3);
      }
    }
    return this.finishOp(code === 124 ? types$1.logicalOR : types$1.logicalAND, 2);
  }
  if (next === 61) {
    return this.finishOp(types$1.assign, 2);
  }
  return this.finishOp(code === 124 ? types$1.bitwiseOR : types$1.bitwiseAND, 1);
};
pp.readToken_caret = function() {
  var next = this.input.charCodeAt(this.pos + 1);
  if (next === 61) {
    return this.finishOp(types$1.assign, 2);
  }
  return this.finishOp(types$1.bitwiseXOR, 1);
};
pp.readToken_plus_min = function(code) {
  var next = this.input.charCodeAt(this.pos + 1);
  if (next === code) {
    if (next === 45 && !this.inModule && this.input.charCodeAt(this.pos + 2) === 62 && (this.lastTokEnd === 0 || lineBreak.test(this.input.slice(this.lastTokEnd, this.pos)))) {
      this.skipLineComment(3);
      this.skipSpace();
      return this.nextToken();
    }
    return this.finishOp(types$1.incDec, 2);
  }
  if (next === 61) {
    return this.finishOp(types$1.assign, 2);
  }
  return this.finishOp(types$1.plusMin, 1);
};
pp.readToken_lt_gt = function(code) {
  var next = this.input.charCodeAt(this.pos + 1);
  var size = 1;
  if (next === code) {
    size = code === 62 && this.input.charCodeAt(this.pos + 2) === 62 ? 3 : 2;
    if (this.input.charCodeAt(this.pos + size) === 61) {
      return this.finishOp(types$1.assign, size + 1);
    }
    return this.finishOp(types$1.bitShift, size);
  }
  if (next === 33 && code === 60 && !this.inModule && this.input.charCodeAt(this.pos + 2) === 45 && this.input.charCodeAt(this.pos + 3) === 45) {
    this.skipLineComment(4);
    this.skipSpace();
    return this.nextToken();
  }
  if (next === 61) {
    size = 2;
  }
  return this.finishOp(types$1.relational, size);
};
pp.readToken_eq_excl = function(code) {
  var next = this.input.charCodeAt(this.pos + 1);
  if (next === 61) {
    return this.finishOp(types$1.equality, this.input.charCodeAt(this.pos + 2) === 61 ? 3 : 2);
  }
  if (code === 61 && next === 62 && this.options.ecmaVersion >= 6) {
    this.pos += 2;
    return this.finishToken(types$1.arrow);
  }
  return this.finishOp(code === 61 ? types$1.eq : types$1.prefix, 1);
};
pp.readToken_question = function() {
  var ecmaVersion2 = this.options.ecmaVersion;
  if (ecmaVersion2 >= 11) {
    var next = this.input.charCodeAt(this.pos + 1);
    if (next === 46) {
      var next2 = this.input.charCodeAt(this.pos + 2);
      if (next2 < 48 || next2 > 57) {
        return this.finishOp(types$1.questionDot, 2);
      }
    }
    if (next === 63) {
      if (ecmaVersion2 >= 12) {
        var next2$1 = this.input.charCodeAt(this.pos + 2);
        if (next2$1 === 61) {
          return this.finishOp(types$1.assign, 3);
        }
      }
      return this.finishOp(types$1.coalesce, 2);
    }
  }
  return this.finishOp(types$1.question, 1);
};
pp.readToken_numberSign = function() {
  var ecmaVersion2 = this.options.ecmaVersion;
  var code = 35;
  if (ecmaVersion2 >= 13) {
    ++this.pos;
    code = this.fullCharCodeAtPos();
    if (isIdentifierStart(code, true) || code === 92) {
      return this.finishToken(types$1.privateId, this.readWord1());
    }
  }
  this.raise(this.pos, "Unexpected character '" + codePointToString(code) + "'");
};
pp.getTokenFromCode = function(code) {
  switch (code) {
    // The interpretation of a dot depends on whether it is followed
    // by a digit or another two dots.
    case 46:
      return this.readToken_dot();
    // Punctuation tokens.
    case 40:
      ++this.pos;
      return this.finishToken(types$1.parenL);
    case 41:
      ++this.pos;
      return this.finishToken(types$1.parenR);
    case 59:
      ++this.pos;
      return this.finishToken(types$1.semi);
    case 44:
      ++this.pos;
      return this.finishToken(types$1.comma);
    case 91:
      ++this.pos;
      return this.finishToken(types$1.bracketL);
    case 93:
      ++this.pos;
      return this.finishToken(types$1.bracketR);
    case 123:
      ++this.pos;
      return this.finishToken(types$1.braceL);
    case 125:
      ++this.pos;
      return this.finishToken(types$1.braceR);
    case 58:
      ++this.pos;
      return this.finishToken(types$1.colon);
    case 96:
      if (this.options.ecmaVersion < 6) {
        break;
      }
      ++this.pos;
      return this.finishToken(types$1.backQuote);
    case 48:
      var next = this.input.charCodeAt(this.pos + 1);
      if (next === 120 || next === 88) {
        return this.readRadixNumber(16);
      }
      if (this.options.ecmaVersion >= 6) {
        if (next === 111 || next === 79) {
          return this.readRadixNumber(8);
        }
        if (next === 98 || next === 66) {
          return this.readRadixNumber(2);
        }
      }
    // Anything else beginning with a digit is an integer, octal
    // number, or float.
    case 49:
    case 50:
    case 51:
    case 52:
    case 53:
    case 54:
    case 55:
    case 56:
    case 57:
      return this.readNumber(false);
    // Quotes produce strings.
    case 34:
    case 39:
      return this.readString(code);
    // Operators are parsed inline in tiny state machines. '=' (61) is
    // often referred to. `finishOp` simply skips the amount of
    // characters it is given as second argument, and returns a token
    // of the type given by its first argument.
    case 47:
      return this.readToken_slash();
    case 37:
    case 42:
      return this.readToken_mult_modulo_exp(code);
    case 124:
    case 38:
      return this.readToken_pipe_amp(code);
    case 94:
      return this.readToken_caret();
    case 43:
    case 45:
      return this.readToken_plus_min(code);
    case 60:
    case 62:
      return this.readToken_lt_gt(code);
    case 61:
    case 33:
      return this.readToken_eq_excl(code);
    case 63:
      return this.readToken_question();
    case 126:
      return this.finishOp(types$1.prefix, 1);
    case 35:
      return this.readToken_numberSign();
  }
  this.raise(this.pos, "Unexpected character '" + codePointToString(code) + "'");
};
pp.finishOp = function(type, size) {
  var str = this.input.slice(this.pos, this.pos + size);
  this.pos += size;
  return this.finishToken(type, str);
};
pp.readRegexp = function() {
  var escaped, inClass, start = this.pos;
  for (; ; ) {
    if (this.pos >= this.input.length) {
      this.raise(start, "Unterminated regular expression");
    }
    var ch = this.input.charAt(this.pos);
    if (lineBreak.test(ch)) {
      this.raise(start, "Unterminated regular expression");
    }
    if (!escaped) {
      if (ch === "[") {
        inClass = true;
      } else if (ch === "]" && inClass) {
        inClass = false;
      } else if (ch === "/" && !inClass) {
        break;
      }
      escaped = ch === "\\";
    } else {
      escaped = false;
    }
    ++this.pos;
  }
  var pattern = this.input.slice(start, this.pos);
  ++this.pos;
  var flagsStart = this.pos;
  var flags = this.readWord1();
  if (this.containsEsc) {
    this.unexpected(flagsStart);
  }
  var state = this.regexpState || (this.regexpState = new RegExpValidationState(this));
  state.reset(start, pattern, flags);
  this.validateRegExpFlags(state);
  this.validateRegExpPattern(state);
  var value = null;
  try {
    value = new RegExp(pattern, flags);
  } catch (e) {
  }
  return this.finishToken(types$1.regexp, { pattern, flags, value });
};
pp.readInt = function(radix, len, maybeLegacyOctalNumericLiteral) {
  var allowSeparators = this.options.ecmaVersion >= 12 && len === void 0;
  var isLegacyOctalNumericLiteral = maybeLegacyOctalNumericLiteral && this.input.charCodeAt(this.pos) === 48;
  var start = this.pos, total = 0, lastCode = 0;
  for (var i2 = 0, e = len == null ? Infinity : len; i2 < e; ++i2, ++this.pos) {
    var code = this.input.charCodeAt(this.pos), val = void 0;
    if (allowSeparators && code === 95) {
      if (isLegacyOctalNumericLiteral) {
        this.raiseRecoverable(this.pos, "Numeric separator is not allowed in legacy octal numeric literals");
      }
      if (lastCode === 95) {
        this.raiseRecoverable(this.pos, "Numeric separator must be exactly one underscore");
      }
      if (i2 === 0) {
        this.raiseRecoverable(this.pos, "Numeric separator is not allowed at the first of digits");
      }
      lastCode = code;
      continue;
    }
    if (code >= 97) {
      val = code - 97 + 10;
    } else if (code >= 65) {
      val = code - 65 + 10;
    } else if (code >= 48 && code <= 57) {
      val = code - 48;
    } else {
      val = Infinity;
    }
    if (val >= radix) {
      break;
    }
    lastCode = code;
    total = total * radix + val;
  }
  if (allowSeparators && lastCode === 95) {
    this.raiseRecoverable(this.pos - 1, "Numeric separator is not allowed at the last of digits");
  }
  if (this.pos === start || len != null && this.pos - start !== len) {
    return null;
  }
  return total;
};
function stringToNumber(str, isLegacyOctalNumericLiteral) {
  if (isLegacyOctalNumericLiteral) {
    return parseInt(str, 8);
  }
  return parseFloat(str.replace(/_/g, ""));
}
function stringToBigInt(str) {
  if (typeof BigInt !== "function") {
    return null;
  }
  return BigInt(str.replace(/_/g, ""));
}
pp.readRadixNumber = function(radix) {
  var start = this.pos;
  this.pos += 2;
  var val = this.readInt(radix);
  if (val == null) {
    this.raise(this.start + 2, "Expected number in radix " + radix);
  }
  if (this.options.ecmaVersion >= 11 && this.input.charCodeAt(this.pos) === 110) {
    val = stringToBigInt(this.input.slice(start, this.pos));
    ++this.pos;
  } else if (isIdentifierStart(this.fullCharCodeAtPos())) {
    this.raise(this.pos, "Identifier directly after number");
  }
  return this.finishToken(types$1.num, val);
};
pp.readNumber = function(startsWithDot) {
  var start = this.pos;
  if (!startsWithDot && this.readInt(10, void 0, true) === null) {
    this.raise(start, "Invalid number");
  }
  var octal = this.pos - start >= 2 && this.input.charCodeAt(start) === 48;
  if (octal && this.strict) {
    this.raise(start, "Invalid number");
  }
  var next = this.input.charCodeAt(this.pos);
  if (!octal && !startsWithDot && this.options.ecmaVersion >= 11 && next === 110) {
    var val$1 = stringToBigInt(this.input.slice(start, this.pos));
    ++this.pos;
    if (isIdentifierStart(this.fullCharCodeAtPos())) {
      this.raise(this.pos, "Identifier directly after number");
    }
    return this.finishToken(types$1.num, val$1);
  }
  if (octal && /[89]/.test(this.input.slice(start, this.pos))) {
    octal = false;
  }
  if (next === 46 && !octal) {
    ++this.pos;
    this.readInt(10);
    next = this.input.charCodeAt(this.pos);
  }
  if ((next === 69 || next === 101) && !octal) {
    next = this.input.charCodeAt(++this.pos);
    if (next === 43 || next === 45) {
      ++this.pos;
    }
    if (this.readInt(10) === null) {
      this.raise(start, "Invalid number");
    }
  }
  if (isIdentifierStart(this.fullCharCodeAtPos())) {
    this.raise(this.pos, "Identifier directly after number");
  }
  var val = stringToNumber(this.input.slice(start, this.pos), octal);
  return this.finishToken(types$1.num, val);
};
pp.readCodePoint = function() {
  var ch = this.input.charCodeAt(this.pos), code;
  if (ch === 123) {
    if (this.options.ecmaVersion < 6) {
      this.unexpected();
    }
    var codePos = ++this.pos;
    code = this.readHexChar(this.input.indexOf("}", this.pos) - this.pos);
    ++this.pos;
    if (code > 1114111) {
      this.invalidStringToken(codePos, "Code point out of bounds");
    }
  } else {
    code = this.readHexChar(4);
  }
  return code;
};
pp.readString = function(quote) {
  var out = "", chunkStart = ++this.pos;
  for (; ; ) {
    if (this.pos >= this.input.length) {
      this.raise(this.start, "Unterminated string constant");
    }
    var ch = this.input.charCodeAt(this.pos);
    if (ch === quote) {
      break;
    }
    if (ch === 92) {
      out += this.input.slice(chunkStart, this.pos);
      out += this.readEscapedChar(false);
      chunkStart = this.pos;
    } else if (ch === 8232 || ch === 8233) {
      if (this.options.ecmaVersion < 10) {
        this.raise(this.start, "Unterminated string constant");
      }
      ++this.pos;
      if (this.options.locations) {
        this.curLine++;
        this.lineStart = this.pos;
      }
    } else {
      if (isNewLine(ch)) {
        this.raise(this.start, "Unterminated string constant");
      }
      ++this.pos;
    }
  }
  out += this.input.slice(chunkStart, this.pos++);
  return this.finishToken(types$1.string, out);
};
var INVALID_TEMPLATE_ESCAPE_ERROR = {};
pp.tryReadTemplateToken = function() {
  this.inTemplateElement = true;
  try {
    this.readTmplToken();
  } catch (err) {
    if (err === INVALID_TEMPLATE_ESCAPE_ERROR) {
      this.readInvalidTemplateToken();
    } else {
      throw err;
    }
  }
  this.inTemplateElement = false;
};
pp.invalidStringToken = function(position, message) {
  if (this.inTemplateElement && this.options.ecmaVersion >= 9) {
    throw INVALID_TEMPLATE_ESCAPE_ERROR;
  } else {
    this.raise(position, message);
  }
};
pp.readTmplToken = function() {
  var out = "", chunkStart = this.pos;
  for (; ; ) {
    if (this.pos >= this.input.length) {
      this.raise(this.start, "Unterminated template");
    }
    var ch = this.input.charCodeAt(this.pos);
    if (ch === 96 || ch === 36 && this.input.charCodeAt(this.pos + 1) === 123) {
      if (this.pos === this.start && (this.type === types$1.template || this.type === types$1.invalidTemplate)) {
        if (ch === 36) {
          this.pos += 2;
          return this.finishToken(types$1.dollarBraceL);
        } else {
          ++this.pos;
          return this.finishToken(types$1.backQuote);
        }
      }
      out += this.input.slice(chunkStart, this.pos);
      return this.finishToken(types$1.template, out);
    }
    if (ch === 92) {
      out += this.input.slice(chunkStart, this.pos);
      out += this.readEscapedChar(true);
      chunkStart = this.pos;
    } else if (isNewLine(ch)) {
      out += this.input.slice(chunkStart, this.pos);
      ++this.pos;
      switch (ch) {
        case 13:
          if (this.input.charCodeAt(this.pos) === 10) {
            ++this.pos;
          }
        case 10:
          out += "\n";
          break;
        default:
          out += String.fromCharCode(ch);
          break;
      }
      if (this.options.locations) {
        ++this.curLine;
        this.lineStart = this.pos;
      }
      chunkStart = this.pos;
    } else {
      ++this.pos;
    }
  }
};
pp.readInvalidTemplateToken = function() {
  for (; this.pos < this.input.length; this.pos++) {
    switch (this.input[this.pos]) {
      case "\\":
        ++this.pos;
        break;
      case "$":
        if (this.input[this.pos + 1] !== "{") {
          break;
        }
      // fall through
      case "`":
        return this.finishToken(types$1.invalidTemplate, this.input.slice(this.start, this.pos));
      case "\r":
        if (this.input[this.pos + 1] === "\n") {
          ++this.pos;
        }
      // fall through
      case "\n":
      case "\u2028":
      case "\u2029":
        ++this.curLine;
        this.lineStart = this.pos + 1;
        break;
    }
  }
  this.raise(this.start, "Unterminated template");
};
pp.readEscapedChar = function(inTemplate) {
  var ch = this.input.charCodeAt(++this.pos);
  ++this.pos;
  switch (ch) {
    case 110:
      return "\n";
    // 'n' -> '\n'
    case 114:
      return "\r";
    // 'r' -> '\r'
    case 120:
      return String.fromCharCode(this.readHexChar(2));
    // 'x'
    case 117:
      return codePointToString(this.readCodePoint());
    // 'u'
    case 116:
      return "	";
    // 't' -> '\t'
    case 98:
      return "\b";
    // 'b' -> '\b'
    case 118:
      return "\v";
    // 'v' -> '\u000b'
    case 102:
      return "\f";
    // 'f' -> '\f'
    case 13:
      if (this.input.charCodeAt(this.pos) === 10) {
        ++this.pos;
      }
    // '\r\n'
    case 10:
      if (this.options.locations) {
        this.lineStart = this.pos;
        ++this.curLine;
      }
      return "";
    case 56:
    case 57:
      if (this.strict) {
        this.invalidStringToken(
          this.pos - 1,
          "Invalid escape sequence"
        );
      }
      if (inTemplate) {
        var codePos = this.pos - 1;
        this.invalidStringToken(
          codePos,
          "Invalid escape sequence in template string"
        );
      }
    default:
      if (ch >= 48 && ch <= 55) {
        var octalStr = this.input.substr(this.pos - 1, 3).match(/^[0-7]+/)[0];
        var octal = parseInt(octalStr, 8);
        if (octal > 255) {
          octalStr = octalStr.slice(0, -1);
          octal = parseInt(octalStr, 8);
        }
        this.pos += octalStr.length - 1;
        ch = this.input.charCodeAt(this.pos);
        if ((octalStr !== "0" || ch === 56 || ch === 57) && (this.strict || inTemplate)) {
          this.invalidStringToken(
            this.pos - 1 - octalStr.length,
            inTemplate ? "Octal literal in template string" : "Octal literal in strict mode"
          );
        }
        return String.fromCharCode(octal);
      }
      if (isNewLine(ch)) {
        if (this.options.locations) {
          this.lineStart = this.pos;
          ++this.curLine;
        }
        return "";
      }
      return String.fromCharCode(ch);
  }
};
pp.readHexChar = function(len) {
  var codePos = this.pos;
  var n = this.readInt(16, len);
  if (n === null) {
    this.invalidStringToken(codePos, "Bad character escape sequence");
  }
  return n;
};
pp.readWord1 = function() {
  this.containsEsc = false;
  var word = "", first = true, chunkStart = this.pos;
  var astral = this.options.ecmaVersion >= 6;
  while (this.pos < this.input.length) {
    var ch = this.fullCharCodeAtPos();
    if (isIdentifierChar(ch, astral)) {
      this.pos += ch <= 65535 ? 1 : 2;
    } else if (ch === 92) {
      this.containsEsc = true;
      word += this.input.slice(chunkStart, this.pos);
      var escStart = this.pos;
      if (this.input.charCodeAt(++this.pos) !== 117) {
        this.invalidStringToken(this.pos, "Expecting Unicode escape sequence \\uXXXX");
      }
      ++this.pos;
      var esc = this.readCodePoint();
      if (!(first ? isIdentifierStart : isIdentifierChar)(esc, astral)) {
        this.invalidStringToken(escStart, "Invalid Unicode escape");
      }
      word += codePointToString(esc);
      chunkStart = this.pos;
    } else {
      break;
    }
    first = false;
  }
  return word + this.input.slice(chunkStart, this.pos);
};
pp.readWord = function() {
  var word = this.readWord1();
  var type = types$1.name;
  if (this.keywords.test(word)) {
    type = keywords[word];
  }
  return this.finishToken(type, word);
};
var version = "8.17.0";
Parser.acorn = {
  Parser,
  version,
  defaultOptions,
  Position,
  SourceLocation,
  getLineInfo,
  Node,
  TokenType,
  tokTypes: types$1,
  keywordTypes: keywords,
  TokContext,
  tokContexts: types,
  isIdentifierChar,
  isIdentifierStart,
  Token,
  isNewLine,
  lineBreak,
  lineBreakG,
  nonASCIIwhitespace
};
function parse3(input, options) {
  return Parser.parse(input, options);
}

// src/parser/ast.ts
var skipKeys = /* @__PURE__ */ new Set(["type", "start", "end", "loc", "range"]);
function isNode(value) {
  return typeof value === "object" && value !== null && typeof value.type === "string" && typeof value.start === "number";
}
function parseSource(source2) {
  for (const sourceType of ["script", "module"]) {
    try {
      return parse3(source2, {
        ecmaVersion: "latest",
        sourceType,
        locations: true,
        allowHashBang: true
      });
    } catch {
      continue;
    }
  }
  return { type: "Program", start: 0, end: 0, body: [], loc: null };
}
function walk(root, visit) {
  const stack = [root];
  while (stack.length > 0) {
    const node2 = stack.pop();
    if (node2 === void 0) {
      continue;
    }
    visit(node2);
    for (const child of children(node2)) {
      stack.push(child);
    }
  }
}
function children(node2) {
  const result = [];
  for (const [key, value] of Object.entries(node2)) {
    if (skipKeys.has(key)) {
      continue;
    }
    if (isNode(value)) {
      result.push(value);
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) {
          result.push(item);
        }
      }
    }
  }
  return result;
}
function line(node2) {
  const value = node2.loc?.start.line;
  return value === void 0 ? 0 : value - 1;
}
function column(node2) {
  return node2.loc?.start.column ?? 0;
}
function identifier(node2) {
  if (!isNode(node2) || node2.type !== "Identifier") {
    return void 0;
  }
  return typeof node2.name === "string" ? node2.name : void 0;
}
function stringValue(node2) {
  if (!isNode(node2) || node2.type !== "Literal") {
    return void 0;
  }
  return typeof node2.value === "string" ? node2.value : void 0;
}
function staticStringValue(node2) {
  const literal2 = stringValue(node2);
  if (literal2 !== void 0) {
    return literal2;
  }
  if (!isNode(node2) || node2.type !== "TemplateLiteral") {
    return void 0;
  }
  const expressions = node2.expressions;
  if (Array.isArray(expressions) && expressions.length > 0) {
    return void 0;
  }
  const quasis = node2.quasis;
  if (!Array.isArray(quasis) || quasis.length !== 1) {
    return void 0;
  }
  const quasi = quasis[0];
  const cooked = isNode(quasi) ? quasi.value?.cooked : void 0;
  return typeof cooked === "string" ? cooked : void 0;
}
function numberValue(node2) {
  if (!isNode(node2) || node2.type !== "Literal") {
    return void 0;
  }
  return typeof node2.value === "number" ? node2.value : void 0;
}
function properties(node2) {
  if (node2 === void 0 || node2.type !== "ObjectExpression" || !Array.isArray(node2.properties)) {
    return [];
  }
  return node2.properties.filter(isNode).filter((property) => property.type === "Property");
}
function elements(node2) {
  if (node2 === void 0 || node2.type !== "ArrayExpression" || !Array.isArray(node2.elements)) {
    return [];
  }
  return node2.elements.filter(isNode);
}
function propertyKey(property) {
  const key = property.key;
  const numeric = numberValue(key);
  return identifier(key) ?? stringValue(key) ?? (numeric === void 0 ? void 0 : String(numeric));
}
function propertyValue(property) {
  return isNode(property.value) ? property.value : void 0;
}
function memberName(node2) {
  return identifier(node2.property) ?? stringValue(node2.property);
}
function objectProperty(node2, name) {
  if (node2 === void 0) {
    return void 0;
  }
  for (const property of properties(node2)) {
    if (propertyKey(property) === name) {
      return propertyValue(property);
    }
  }
  return void 0;
}
function firstArgument(call) {
  return Array.isArray(call.arguments) && isNode(call.arguments[0]) ? call.arguments[0] : void 0;
}
function firstStringArgument(call) {
  return stringValue(firstArgument(call));
}

// src/parser/moleculerParser.ts
var reservedThisProps = /* @__PURE__ */ new Set([
  "broker",
  "logger",
  "actions",
  "settings",
  "metadata",
  "schema",
  "Promise",
  "name",
  "version"
]);
var symbolBlocks = [
  ["actions", "action" /* Action */],
  ["events", "event" /* Event */],
  ["methods", "method" /* Method */],
  ["channels", "channel" /* Channel */]
];
var MoleculerParser = class {
  parse(filePath, source2) {
    const ast = parseSource(source2);
    const service = findServiceObject(ast);
    if (service === void 0) {
      return this.parsePlainFile(filePath, ast);
    }
    const named = hasServiceName(service);
    const namespace = serviceNamespace(filePath, service);
    const symbols = extractSymbols(service, namespace);
    if (!named && symbols.length === 0) {
      return this.parsePlainFile(filePath, ast);
    }
    return {
      symbols,
      references: [...extractReferences(ast), ...extractHookReferences(service)],
      mixins: extractMixins(service, filePath, requirePaths(ast)),
      isService: named,
      outline: extractOutline(service, named ? namespace : outlineName(filePath))
    };
  }
  namespaceOf(filePath, source2) {
    const service = findServiceObject(parseSource(source2));
    return service === void 0 ? fallbackNamespace(filePath) : serviceNamespace(filePath, service);
  }
  parsePlainFile(filePath, ast) {
    const namespace = fallbackNamespace(filePath);
    return {
      symbols: extractClassMethods(ast, namespace),
      references: extractReferences(ast),
      mixins: [],
      isService: false
    };
  }
};
function findServiceObject(ast) {
  let found;
  walk(ast, (node2) => {
    if (found !== void 0 || node2.type !== "AssignmentExpression") {
      return;
    }
    if (isModuleExports(node2.left) && isNode(node2.right) && node2.right.type === "ObjectExpression") {
      found = node2.right;
    }
  });
  return found;
}
function isModuleExports(value) {
  if (!isNode(value) || value.type !== "MemberExpression") {
    return false;
  }
  return identifier(value.object) === "module" && memberName(value) === "exports";
}
function hasServiceName(service) {
  const name = stringValue(objectProperty(service, "name"));
  return name !== void 0 && name.length > 0;
}
function serviceNamespace(filePath, service) {
  const name = stringValue(objectProperty(service, "name")) ?? "";
  if (name.length === 0) {
    return fallbackNamespace(filePath);
  }
  const version2 = numberValue(objectProperty(service, "version")) ?? 0;
  return version2 > 0 ? `v${version2}.${name}` : name;
}
function fallbackNamespace(filePath) {
  const base = filePath.split("/").pop() ?? "";
  const stem = base.replace(/\.mixins?\.js$/, "").replace(/\.js$/, "");
  let hash = 0;
  for (let i2 = 0; i2 < filePath.length; i2 += 1) {
    hash = (hash << 5) - hash + filePath.charCodeAt(i2) | 0;
  }
  return `#file_${stem}_${Math.abs(hash).toString(36)}`;
}
function extractSymbols(service, namespace) {
  return symbolBlocks.flatMap(([blockName, kind]) => {
    const block = objectProperty(service, blockName);
    return properties(block).flatMap((property) => {
      const name = propertyKey(property);
      if (name === void 0 || name === "handler") {
        return [];
      }
      const key = isNode(property.key) ? property.key : property;
      return [{
        id: 0,
        name,
        fullName: `${namespace}.${name}`,
        namespace,
        kind,
        fileId: 0,
        sourceFileId: 0,
        line: line(key),
        column: column(key)
      }];
    });
  });
}
function extractOutline(service, name) {
  const groups = [];
  const mixins = objectProperty(service, "mixins");
  if (mixins !== void 0) {
    groups.push(group("mixins", mixins, elements(mixins).flatMap((mixin) => {
      const mixinName = identifier(mixin);
      return mixinName === void 0 ? [] : [node(mixinName, "mixin", mixin)];
    })));
  }
  for (const [blockName, kind] of symbolBlocks) {
    const block = objectProperty(service, blockName);
    if (block === void 0) {
      continue;
    }
    groups.push(group(blockName, block, properties(block).flatMap((property) => {
      const name2 = propertyKey(property);
      if (name2 === void 0 || name2 === "handler") {
        return [];
      }
      const key = isNode(property.key) ? property.key : property;
      return [node(name2, outlineKind(kind), key)];
    })));
  }
  const hooks = objectProperty(service, "hooks");
  if (hooks !== void 0) {
    groups.push(group("hooks", hooks, ["before", "after", "error"].flatMap((phase) => {
      const phaseValue = objectProperty(hooks, phase);
      if (phaseValue === void 0) {
        return [];
      }
      return [group(phase, phaseValue, properties(phaseValue).flatMap((property) => {
        const action = propertyKey(property);
        const key = isNode(property.key) ? property.key : property;
        return action === void 0 ? [] : [node(action, "hook", key)];
      }), "hookPhase")];
    })));
  }
  return { name, line: line(service), column: column(service), groups };
}
function group(name, source2, children2, kind = "group") {
  return { name, kind, line: line(source2), column: column(source2), children: children2 };
}
function node(name, kind, source2) {
  return { name, kind, line: line(source2), column: column(source2), children: [] };
}
function outlineKind(kind) {
  if (kind === "action" /* Action */) return "action";
  if (kind === "event" /* Event */) return "event";
  if (kind === "channel" /* Channel */) return "channel";
  return "method";
}
function outlineName(filePath) {
  const base = filePath.split("/").pop() ?? filePath;
  return base.replace(/\.js$/, "");
}
function extractClassMethods(ast, namespace) {
  const symbols = [];
  walk(ast, (node2) => {
    if (node2.type !== "ClassDeclaration" && node2.type !== "ClassExpression") {
      return;
    }
    const body = node2.body;
    if (!isNode(body) || !Array.isArray(body.body)) {
      return;
    }
    for (const member of body.body) {
      if (!isNode(member) || member.type !== "MethodDefinition" || !isNode(member.key)) {
        continue;
      }
      const name = identifier(member.key);
      if (name === void 0 || name === "constructor") {
        continue;
      }
      symbols.push({
        id: 0,
        name,
        fullName: `${namespace}.${name}`,
        namespace,
        kind: "method" /* Method */,
        fileId: 0,
        sourceFileId: 0,
        line: line(member.key),
        column: column(member.key)
      });
    }
  });
  return symbols;
}
function requirePaths(ast) {
  const paths = /* @__PURE__ */ new Map();
  walk(ast, (node2) => {
    if (node2.type !== "VariableDeclarator") {
      return;
    }
    const name = identifier(node2.id);
    const init = node2.init;
    if (name === void 0 || !isNode(init) || init.type !== "CallExpression") {
      return;
    }
    if (identifier(init.callee) !== "require") {
      return;
    }
    const target = firstStringArgument(init);
    if (target !== void 0) {
      paths.set(name, target);
    }
  });
  return paths;
}
function extractMixins(service, filePath, paths) {
  return elements(objectProperty(service, "mixins")).flatMap((element) => {
    const mixinName = identifier(element);
    if (mixinName === void 0) {
      return [];
    }
    return [{ mixinName, requirePath: paths.get(mixinName) ?? "", sourceFile: filePath }];
  });
}
function extractReferences(ast) {
  const references = [];
  walk(ast, (node2) => {
    if (node2.type !== "CallExpression" || !isNode(node2.callee) || node2.callee.type !== "MemberExpression") {
      return;
    }
    const callee = node2.callee;
    const method = memberName(callee);
    if (method === void 0) {
      return;
    }
    if (method === "call" || method === "emit" || method === "broadcast") {
      const target = firstStringArgument(node2);
      if (target !== void 0 && isBrokerLike(callee.object)) {
        const arg = firstArgument(node2);
        references.push({
          fullName: target,
          location: { fileId: 0, line: line(arg ?? node2), column: column(arg ?? node2) },
          kind: referenceKind(method)
        });
      }
      return;
    }
    if (method === "publish" || method === "sendToChannel") {
      const arg = firstArgument(node2);
      const target = staticStringValue(arg);
      if (target !== void 0 && isPublishLike(callee.object, method)) {
        references.push({
          fullName: target,
          location: { fileId: 0, line: line(arg ?? node2), column: column(arg ?? node2) },
          kind: method === "sendToChannel" ? "channel" /* Channel */ : "emit" /* Emit */
        });
      }
      return;
    }
    const selfName = selfCallName(callee, method);
    if (selfName !== void 0) {
      const anchor = isNode(callee.property) ? callee.property : callee;
      references.push({
        fullName: selfName,
        location: { fileId: 0, line: line(anchor), column: column(anchor) },
        kind: "call" /* Call */
      });
    }
  });
  return references;
}
function isPublishLike(value, method) {
  if (method === "publish") {
    return isNode(value) && value.type === "ThisExpression";
  }
  return isBrokerLike(value);
}
function selfCallName(callee, method) {
  const object = callee.object;
  if (!isNode(object)) {
    return void 0;
  }
  if (object.type === "ThisExpression") {
    return reservedThisProps.has(method) ? void 0 : selfRef(method);
  }
  if (object.type === "MemberExpression" && isNode(object.object) && object.object.type === "ThisExpression") {
    const holder = memberName(object);
    return holder === void 0 || reservedThisProps.has(holder) ? void 0 : selfRef(method);
  }
  return void 0;
}
function extractHookReferences(service) {
  const references = [];
  const hooks = objectProperty(service, "hooks");
  if (hooks === void 0) {
    return references;
  }
  for (const phase of ["before", "after", "error"]) {
    const phaseValue = objectProperty(hooks, phase);
    if (phaseValue === void 0) {
      continue;
    }
    for (const action of properties(phaseValue)) {
      const value = propertyValue(action);
      if (value === void 0) {
        continue;
      }
      const nodes = value.type === "ArrayExpression" ? elements(value) : [value];
      for (const node2 of nodes) {
        const name = stringValue(node2);
        if (name !== void 0 && name.length > 0 && !name.includes(".")) {
          references.push({
            fullName: selfRef(name),
            location: { fileId: 0, line: line(node2), column: column(node2) },
            kind: "call" /* Call */
          });
        }
      }
    }
  }
  return references;
}
function isBrokerLike(value) {
  if (!isNode(value)) {
    return false;
  }
  const name = identifier(value);
  if (name === "ctx" || name === "broker") {
    return true;
  }
  if (value.type !== "MemberExpression" || memberName(value) !== "broker") {
    return false;
  }
  const object = value.object;
  return isNode(object) && (object.type === "ThisExpression" || identifier(object) === "ctx");
}
function referenceKind(method) {
  if (method === "emit") {
    return "emit" /* Emit */;
  }
  if (method === "broadcast") {
    return "broadcast" /* Broadcast */;
  }
  return "call" /* Call */;
}
var SELF_PREFIX = "#self.";
function selfRef(method) {
  return `${SELF_PREFIX}${method}`;
}
function isSelfRef(fullName) {
  return fullName.startsWith(SELF_PREFIX);
}
function selfMethod(fullName) {
  return fullName.slice(SELF_PREFIX.length);
}

// src/scanner/scanner.ts
import fs from "node:fs";
import path from "node:path";
var skipDirs = /* @__PURE__ */ new Set(["node_modules", ".git", ".vscode", "dist", "build", "coverage", ".next", "out"]);
var Scanner = class {
  constructor(index) {
    this.index = index;
  }
  index;
  parser = new MoleculerParser();
  namespaces = /* @__PURE__ */ new Map();
  serviceFiles = /* @__PURE__ */ new Set();
  mixinSources = /* @__PURE__ */ new Map();
  lastResult = { dropped: [], mixinFailures: [], fileCount: 0 };
  scan(rootPath) {
    this.index.clear();
    this.namespaces.clear();
    this.serviceFiles.clear();
    this.mixinSources.clear();
    const records = this.parseAll(collectFiles(rootPath));
    const mixinFailures = this.resolveMixins(records);
    const dropped = this.resolveReferences(records);
    this.lastResult = { dropped, mixinFailures, fileCount: records.length };
    return this.lastResult;
  }
  result() {
    return this.lastResult;
  }
  namespaceOf(fileId) {
    return this.namespaces.get(fileId) ?? "";
  }
  isServiceFile(fileId) {
    return this.serviceFiles.has(fileId);
  }
  mixinSourcesOf(fileId) {
    return this.mixinSources.get(fileId) ?? /* @__PURE__ */ new Set();
  }
  parseAll(files) {
    const records = [];
    for (const filePath of files) {
      const source2 = readFile(filePath);
      if (source2 === void 0) {
        continue;
      }
      const fileId = this.index.fileId(filePath);
      const parsed = this.parser.parse(filePath, source2);
      const namespace = parsed.symbols[0]?.namespace ?? this.parser.namespaceOf(filePath, source2);
      this.namespaces.set(fileId, namespace);
      if (parsed.isService) {
        this.serviceFiles.add(fileId);
      }
      for (const symbol of parsed.symbols) {
        symbol.fileId = fileId;
        symbol.sourceFileId = fileId;
        this.index.insert(symbol);
      }
      for (const reference of parsed.references) {
        reference.location.fileId = fileId;
      }
      records.push({
        filePath,
        fileId,
        namespace,
        isService: parsed.isService,
        references: parsed.references,
        mixins: parsed.mixins
      });
    }
    return records;
  }
  resolveMixins(records) {
    const failures = [];
    const pending = [];
    for (const record of records) {
      for (const mixin of record.mixins) {
        if (!isLocalRequire(mixin.requirePath)) {
          continue;
        }
        const mixinPath = resolveRequire(mixin.sourceFile, mixin.requirePath);
        if (mixinPath.length === 0) {
          failures.push({ ...mixin, reason: "broken-require-path" /* BrokenRequirePath */ });
          continue;
        }
        if (record.namespace.length === 0) {
          failures.push({ ...mixin, reason: "namespace-empty" /* NamespaceEmpty */ });
          continue;
        }
        const mixinFileId = this.index.fileId(mixinPath);
        this.linkMixin(record.fileId, mixinFileId);
        pending.push({ record, mixin, mixinFileId });
      }
    }
    while (pending.length > 0) {
      let inserted = 0;
      for (const item of pending) {
        inserted += this.copyMixinSymbols(item.record, item.mixinFileId);
      }
      if (inserted === 0) {
        break;
      }
    }
    return failures;
  }
  linkMixin(consumerFileId, mixinFileId) {
    const existing = this.mixinSources.get(consumerFileId);
    if (existing === void 0) {
      this.mixinSources.set(consumerFileId, /* @__PURE__ */ new Set([mixinFileId]));
      return;
    }
    existing.add(mixinFileId);
  }
  copyMixinSymbols(record, mixinFileId) {
    let inserted = 0;
    for (const symbol of this.index.symbolsByFile(mixinFileId)) {
      const fullName = `${record.namespace}.${symbol.name}`;
      if (this.index.has(fullName)) {
        continue;
      }
      const copy = {
        ...symbol,
        id: 0,
        fullName,
        namespace: record.namespace,
        fileId: record.fileId,
        sourceFileId: symbol.sourceFileId
      };
      if (this.index.insert(copy)) {
        inserted += 1;
      }
    }
    return inserted;
  }
  resolveReferences(records) {
    const dropped = [];
    for (const record of records) {
      for (const reference of record.references) {
        const resolved = this.resolveOne(record, reference);
        if (resolved.fullName !== void 0 && this.index.addReference(resolved.fullName, reference.location)) {
          continue;
        }
        if (resolved.silent) {
          continue;
        }
        dropped.push({
          fullName: reference.fullName,
          kind: reference.kind,
          location: reference.location,
          reason: resolved.reason ?? "genuinely-unresolved" /* GenuinelyUnresolved */
        });
      }
    }
    return dropped;
  }
  resolveOne(record, reference) {
    if (isSelfRef(reference.fullName)) {
      if (!record.isService) {
        return { silent: true };
      }
      if (record.namespace.length === 0) {
        return { reason: "namespace-empty" /* NamespaceEmpty */ };
      }
      return { fullName: `${record.namespace}.${selfMethod(reference.fullName)}` };
    }
    if (reference.kind === "emit" /* Emit */ || reference.kind === "broadcast" /* Broadcast */ || reference.kind === "channel" /* Channel */) {
      return this.resolveEvent(record, reference);
    }
    if (this.index.has(reference.fullName)) {
      return { fullName: reference.fullName };
    }
    return { reason: "genuinely-unresolved" /* GenuinelyUnresolved */ };
  }
  resolveEvent(record, reference) {
    if (this.index.has(reference.fullName)) {
      return { fullName: reference.fullName };
    }
    const targetKind = reference.kind === "channel" /* Channel */ ? "channel" /* Channel */ : "event" /* Event */;
    const matches = this.index.allSymbols().filter(
      (symbol) => symbol.kind === targetKind && symbol.name === reference.fullName
    );
    if (matches.length === 0) {
      return { reason: "event-no-listener" /* EventNoListener */ };
    }
    const distinctOrigins = new Set(matches.map((symbol) => symbol.sourceFileId));
    if (distinctOrigins.size === 1) {
      return this.pickSameOriginMatch(record, matches);
    }
    const related = matches.filter((symbol) => this.isRelated(record.fileId, record.namespace, symbol));
    const relatedOrigins = new Set(related.map((symbol) => symbol.sourceFileId));
    if (relatedOrigins.size === 1) {
      return this.pickSameOriginMatch(record, related);
    }
    return { reason: "name-collision" /* NameCollision */ };
  }
  pickSameOriginMatch(record, matches) {
    const local = matches.find((symbol) => symbol.fileId === record.fileId);
    return { fullName: (local ?? matches[0])?.fullName };
  }
  isRelated(callerFileId, callerNamespace, candidate) {
    if (callerNamespace.length > 0 && candidate.namespace === callerNamespace) {
      return true;
    }
    if (candidate.fileId === callerFileId || candidate.sourceFileId === callerFileId) {
      return true;
    }
    const sources = this.mixinSources.get(callerFileId);
    if (sources === void 0) {
      return false;
    }
    return sources.has(candidate.sourceFileId) || sources.has(candidate.fileId);
  }
};
function collectFiles(rootPath) {
  const results = [];
  const visit = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) {
          visit(fullPath);
        }
        continue;
      }
      if (entry.isFile() && fullPath.endsWith(".js")) {
        results.push(fullPath);
      }
    }
  };
  visit(rootPath);
  return results;
}
function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return void 0;
  }
}
function isLocalRequire(requirePath) {
  return requirePath.startsWith(".") || requirePath.startsWith("/");
}
function resolveRequire(sourceFile, requirePath) {
  if (requirePath.length === 0 || !requirePath.startsWith(".")) {
    return "";
  }
  const base = path.resolve(path.dirname(sourceFile), requirePath);
  for (const candidate of [base, `${base}.js`, path.join(base, "index.js")]) {
    if (candidate.endsWith(".js") && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return "";
}

// src/lsp/server.ts
import { fileURLToPath as fileURLToPath3 } from "node:url";

// src/scanner/watcher.ts
var ignoredParts = ["/node_modules/", "/.git/", "/dist/", "/build/", "/coverage/"];
var Watcher = class {
  constructor(onChange, debounceMs = 250) {
    this.onChange = onChange;
    this.debounceMs = debounceMs;
  }
  onChange;
  debounceMs;
  watcher;
  timer;
  watch(rootPath) {
    void Promise.resolve().then(() => (init_esm2(), esm_exports)).then((module) => {
      const watcher = module.default.watch(rootPath, {
        ignored: (filePath) => isIgnored(filePath),
        ignoreInitial: true
      });
      for (const event of ["add", "change", "unlink"]) {
        watcher.on(event, (filePath) => this.schedule(filePath));
      }
      watcher.on("error", () => void 0);
      this.watcher = watcher;
    }).catch(() => void 0);
  }
  close() {
    if (this.timer !== void 0) {
      clearTimeout(this.timer);
      this.timer = void 0;
    }
    void this.watcher?.close();
    this.watcher = void 0;
  }
  schedule(filePath) {
    if (!filePath.endsWith(".js")) {
      return;
    }
    if (this.timer !== void 0) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = void 0;
      this.onChange();
    }, this.debounceMs);
  }
};
function isIgnored(filePath) {
  return ignoredParts.some((part) => filePath.includes(part));
}

// src/lsp/protocol.ts
var SymbolKind2 = {
  Module: 2,
  Namespace: 3,
  Method: 6,
  Object: 19,
  Event: 24
};
var DiagnosticSeverity = {
  Error: 1,
  Warning: 2,
  Information: 3,
  Hint: 4
};
var ErrorCodes = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  ServerNotInitialized: -32002
};
function isRecord(value) {
  return typeof value === "object" && value !== null;
}

// src/lsp/diagnostics.ts
var source = "moleculer";
function diagnosticsByFile(index, scanner) {
  const byFile = /* @__PURE__ */ new Map();
  const add = (fileId, diagnostic) => {
    const existing = byFile.get(fileId);
    if (existing === void 0) {
      byFile.set(fileId, [diagnostic]);
      return;
    }
    existing.push(diagnostic);
  };
  const result = scanner.result();
  for (const failure of result.mixinFailures) {
    add(index.fileId(failure.sourceFile), mixinDiagnostic(failure));
  }
  for (const dropped of result.dropped) {
    const diagnostic = referenceDiagnostic(dropped);
    if (diagnostic !== void 0) {
      add(dropped.location.fileId, diagnostic);
    }
  }
  for (const [fileId, diagnostic] of collisionDiagnostics(index)) {
    add(fileId, diagnostic);
  }
  return byFile;
}
function mixinDiagnostic(failure) {
  const message = failure.reason === "broken-require-path" /* BrokenRequirePath */ ? `Mixin "${failure.mixinName}" does not resolve to a file${failure.requirePath.length > 0 ? ` (require "${failure.requirePath}")` : ""}` : `Mixin "${failure.mixinName}" cannot be applied: service has no resolvable name`;
  return {
    range: zeroRange(),
    severity: DiagnosticSeverity.Error,
    source,
    code: failure.reason,
    message
  };
}
function referenceDiagnostic(dropped) {
  const range2 = referenceRange(dropped);
  if (dropped.reason === "name-collision" /* NameCollision */) {
    return {
      range: range2,
      severity: DiagnosticSeverity.Error,
      source,
      code: dropped.reason,
      message: `"${displayName(dropped.fullName)}" matches multiple services; target is ambiguous`
    };
  }
  if (dropped.reason === "event-no-listener" /* EventNoListener */) {
    return {
      range: range2,
      severity: DiagnosticSeverity.Hint,
      source,
      code: dropped.reason,
      message: `No local listener found for event "${dropped.fullName}"`
    };
  }
  if (dropped.reason === "genuinely-unresolved" /* GenuinelyUnresolved */) {
    return {
      range: range2,
      severity: DiagnosticSeverity.Hint,
      source,
      code: dropped.reason,
      message: `"${displayName(dropped.fullName)}" is not defined in this workspace`
    };
  }
  return void 0;
}
function collisionDiagnostics(index) {
  const buckets = /* @__PURE__ */ new Map();
  for (const symbol of index.allSymbols()) {
    if (symbol.kind !== "event" /* Event */ || symbol.fileId !== symbol.sourceFileId) {
      continue;
    }
    const bucket = buckets.get(symbol.name) ?? [];
    bucket.push({
      fileId: symbol.fileId,
      line: symbol.line,
      column: symbol.column,
      namespace: symbol.namespace,
      length: symbol.name.length
    });
    buckets.set(symbol.name, bucket);
  }
  const results = [];
  for (const [name, bucket] of buckets) {
    const namespaces = new Set(bucket.map((entry) => entry.namespace));
    if (namespaces.size < 2) {
      continue;
    }
    for (const entry of bucket) {
      results.push([entry.fileId, {
        range: pointRange(entry.line, entry.column, entry.length),
        severity: DiagnosticSeverity.Error,
        source,
        code: "name-collision" /* NameCollision */,
        message: `Event "${name}" is declared in ${namespaces.size} services; emits cannot be resolved unambiguously`
      }]);
    }
  }
  return results;
}
function referenceRange(dropped) {
  if (isSelfRef(dropped.fullName)) {
    return pointRange(dropped.location.line, dropped.location.column, selfMethod(dropped.fullName).length);
  }
  return pointRange(dropped.location.line, dropped.location.column + 1, dropped.fullName.length);
}
function displayName(fullName) {
  return isSelfRef(fullName) ? `this.${selfMethod(fullName)}` : fullName;
}
function pointRange(line2, column2, length) {
  return {
    start: { line: line2, character: column2 },
    end: { line: line2, character: column2 + Math.max(length, 1) }
  };
}
function zeroRange() {
  return { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
}

// src/lsp/handlers.ts
import fs2 from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

// src/lsp/cursor.ts
var reservedThisProps2 = /* @__PURE__ */ new Set([
  "broker",
  "logger",
  "actions",
  "settings",
  "metadata",
  "schema",
  "Promise",
  "name",
  "version"
]);
var globals = /* @__PURE__ */ new Set([
  "console",
  "JSON",
  "Math",
  "Object",
  "Array",
  "String",
  "Number",
  "Boolean",
  "Promise",
  "Buffer",
  "process",
  "fs",
  "path",
  "os",
  "http",
  "https",
  "url",
  "crypto",
  "stream",
  "events",
  "util",
  "assert",
  "vm",
  "ctx",
  "broker",
  "logger",
  "req",
  "res",
  "next",
  "err",
  "error",
  "this",
  "await"
]);
function detect(source2, line2, character, namespace) {
  const text = source2.split("\n")[line2];
  if (text === void 0) {
    return unknown();
  }
  return definitionAt(text, character, namespace) ?? stringLiteralAt(text, character, namespace) ?? thisCallAt(text, character, namespace) ?? localCallAt(text, character, namespace) ?? unknown();
}
function stringLiteralAt(text, character, namespace) {
  let i2 = 0;
  while (i2 < text.length) {
    const quote = text[i2];
    if (quote !== '"' && quote !== "'" && quote !== "`") {
      i2 += 1;
      continue;
    }
    const start = i2;
    i2 += 1;
    while (i2 < text.length && text[i2] !== quote) {
      i2 += text[i2] === "\\" ? 2 : 1;
    }
    if (i2 < text.length && character > start && character <= i2) {
      return classifyString(text.slice(start + 1, i2), character - start - 1, namespace);
    }
    i2 += 1;
  }
  return void 0;
}
function classifyString(value, offset2, namespace) {
  if (value.length === 0) {
    return void 0;
  }
  const parts = value.split(".");
  if (parts.length < 2) {
    return isIdentifier(value) ? { kind: "methodAccess" /* MethodAccess */, fullName: `${namespace}.${value}`, rawString: value } : void 0;
  }
  let position = 0;
  for (let i2 = 0; i2 < parts.length; i2 += 1) {
    const part = parts[i2] ?? "";
    if (offset2 >= position && offset2 < position + part.length) {
      return { kind: segmentKind(parts, i2), fullName: value, rawString: value };
    }
    position += part.length + 1;
  }
  return { kind: "actionString" /* ActionString */, fullName: value, rawString: value };
}
function segmentKind(parts, index) {
  const first = parts[0] ?? "";
  const versioned = first.length >= 2 && first[0] === "v" && isDigit(first[1] ?? "");
  const serviceIndex = versioned ? 1 : 0;
  return index <= serviceIndex ? "serviceName" /* ServiceName */ : "actionString" /* ActionString */;
}
function thisCallAt(text, character, namespace) {
  const marker = "this.";
  let from = 0;
  while (from < text.length) {
    const start = text.indexOf(marker, from);
    if (start < 0) {
      return void 0;
    }
    const nameStart = start + marker.length;
    const open2 = text.indexOf("(", nameStart);
    if (open2 < 0) {
      return void 0;
    }
    const raw = text.slice(nameStart, open2).trim();
    const dot = raw.lastIndexOf(".");
    const method = dot < 0 ? raw : raw.slice(dot + 1);
    const holder = dot < 0 ? void 0 : raw.slice(0, dot);
    const blocked = holder === void 0 ? reservedThisProps2.has(method) : reservedThisProps2.has(holder);
    if (method.length > 0 && !blocked && character >= start && character < open2) {
      return { kind: "methodAccess" /* MethodAccess */, fullName: `${namespace}.${method}`, chained: holder !== void 0 };
    }
    from = open2 + 1;
  }
  return void 0;
}
function localCallAt(text, character, namespace) {
  const pattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const holder = match[1] ?? "";
    const method = match[2] ?? "";
    if (holder.length <= 1 || globals.has(holder) || reservedThisProps2.has(method)) {
      continue;
    }
    const start = match.index + holder.length + 1;
    if (character >= start && character < start + method.length) {
      return { kind: "methodAccess" /* MethodAccess */, fullName: `${namespace}.${method}`, chained: true };
    }
  }
  return void 0;
}
function definitionAt(text, character, namespace) {
  const indent = text.length - text.trimStart().length;
  const name = definitionName(text.trim());
  if (name === void 0) {
    return void 0;
  }
  const start = text.indexOf(name, indent);
  if (start < 0 || character < start || character >= start + name.length) {
    return void 0;
  }
  return {
    kind: "definitionSite" /* DefinitionSite */,
    fullName: namespace.length === 0 ? name : `${namespace}.${name}`
  };
}
function definitionName(trimmed) {
  const colon = trimmed.indexOf(":");
  const paren = trimmed.indexOf("(");
  const boundary = colon >= 0 && (paren < 0 || colon < paren) ? colon : paren;
  if (boundary <= 0) {
    return void 0;
  }
  const head = stripAsync(trimmed.slice(0, boundary)).trim();
  const name = unquote(head);
  if (name.length === 0 || name === "handler" || /[\s\t]/.test(name)) {
    return void 0;
  }
  if (name.includes(".") && name === head) {
    return void 0;
  }
  return name;
}
function stripAsync(value) {
  const trimmed = value.trimStart();
  return trimmed.startsWith("async ") ? trimmed.slice(6).trimStart() : value;
}
function unquote(value) {
  if (value.length < 2) {
    return value;
  }
  const first = value[0];
  if ((first === '"' || first === "'") && value[value.length - 1] === first) {
    return value.slice(1, -1);
  }
  return value;
}
function isDigit(value) {
  return value >= "0" && value <= "9";
}
function isIdentifier(value) {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(value);
}
function unknown() {
  return { kind: "unknown" /* Unknown */, fullName: "" };
}

// src/lsp/handlers.ts
var Handlers = class {
  constructor(index, scanner) {
    this.index = index;
    this.scanner = scanner;
  }
  index;
  scanner;
  documents = /* @__PURE__ */ new Map();
  openDocument(uri, text) {
    this.documents.set(uri, text);
  }
  closeDocument(uri) {
    this.documents.delete(uri);
  }
  definition(params) {
    const target = this.resolveAt(params);
    if (target === void 0) {
      return null;
    }
    if (target.kind === "serviceName" /* ServiceName */ && target.symbol.fileId === 0) {
      return this.serviceLocation(target.fullName);
    }
    return this.symbolLocation(target.symbol);
  }
  references(params) {
    const target = this.resolveAt(params);
    if (target === void 0 || target.kind === "serviceName" /* ServiceName */ && target.symbol.fileId === 0) {
      return [];
    }
    const locations = this.referencesFor(target.symbol, uriToPath(params.textDocument.uri));
    const result = locations.map((location) => this.toLocation(location));
    if (params.context?.includeDeclaration === true) {
      result.unshift(this.symbolLocation(target.symbol));
    }
    return result;
  }
  documentSymbols(params) {
    const filePath = uriToPath(params.textDocument.uri);
    const source2 = this.sourceFor(params.textDocument.uri, filePath);
    if (source2 === void 0) {
      return [];
    }
    const outline = new MoleculerParser().parse(filePath, source2).outline;
    if (outline === void 0) {
      return [];
    }
    return [{
      name: outline.name,
      kind: SymbolKind2.Object,
      range: range(outline.line, outline.column, source2),
      selectionRange: selectionRange(outline.line, outline.column, outline.name.length),
      children: outline.groups.map((group2) => this.toDocumentSymbol(group2, source2))
    }];
  }
  toDocumentSymbol(node2, source2) {
    return {
      name: node2.name,
      kind: documentSymbolKind(node2.kind),
      range: range(node2.line, node2.column, source2),
      selectionRange: selectionRange(node2.line, node2.column, node2.name.length),
      children: node2.children.map((child) => this.toDocumentSymbol(child, source2))
    };
  }
  referencesFor(symbol, callerPath) {
    const callerFileId = this.index.fileId(callerPath);
    const locations = [...this.index.referencesTo(symbol.fullName)];
    for (const candidate of this.index.allSymbols()) {
      if (candidate.fullName === symbol.fullName || candidate.name !== symbol.name) {
        continue;
      }
      if (!this.sharesOrigin(symbol, candidate) && !this.scanner.isRelated(callerFileId, symbol.namespace, candidate)) {
        continue;
      }
      locations.push(...this.index.referencesTo(candidate.fullName));
    }
    return dedupe(locations);
  }
  sharesOrigin(symbol, candidate) {
    return symbol.sourceFileId !== 0 && symbol.sourceFileId === candidate.sourceFileId;
  }
  resolveAt(params) {
    const filePath = uriToPath(params.textDocument.uri);
    const source2 = this.sourceFor(params.textDocument.uri, filePath);
    if (source2 === void 0) {
      return void 0;
    }
    const fileId = this.index.fileId(filePath);
    const namespace = this.scanner.namespaceOf(fileId);
    const context = detect(source2, params.position.line, params.position.character, namespace);
    if (context.kind === "unknown" /* Unknown */) {
      return void 0;
    }
    if (context.rawString !== void 0) {
      const event = this.findEvent(context.rawString, fileId, namespace);
      if (event !== void 0) {
        return { kind: context.kind, fullName: event.fullName, symbol: event };
      }
    }
    const direct = this.index.lookup(context.fullName);
    if (direct !== void 0) {
      return { kind: context.kind, fullName: context.fullName, symbol: direct };
    }
    if (context.kind === "serviceName" /* ServiceName */) {
      return { kind: context.kind, fullName: context.fullName, symbol: placeholder(context.fullName) };
    }
    const symbol = this.findByShortName(shortName(context.fullName), fileId, namespace);
    return symbol === void 0 ? void 0 : { kind: context.kind, fullName: context.fullName, symbol };
  }
  findEvent(name, fileId, namespace) {
    const matches = this.index.allSymbols().filter(
      (symbol) => symbol.kind === "event" /* Event */ && symbol.name === name
    );
    if (matches.length <= 1) {
      return matches[0];
    }
    const related = matches.filter((symbol) => this.scanner.isRelated(fileId, namespace, symbol));
    return related.length === 1 ? related[0] : void 0;
  }
  findByShortName(name, fileId, namespace) {
    const matches = this.index.allSymbols().filter((symbol) => symbol.name === name);
    if (matches.length <= 1) {
      return matches[0];
    }
    const related = matches.filter((symbol) => this.scanner.isRelated(fileId, namespace, symbol));
    if (related.length === 1) {
      return related[0];
    }
    if (related.length > 1) {
      return related.find((symbol) => symbol.fileId === symbol.sourceFileId) ?? related[0];
    }
    return void 0;
  }
  sourceFor(uri, filePath) {
    const cached = this.documents.get(uri);
    if (cached !== void 0) {
      return cached;
    }
    try {
      return fs2.readFileSync(filePath, "utf8");
    } catch {
      return void 0;
    }
  }
  serviceLocation(fullName) {
    const namespace = fullName.split(".").slice(0, -1).join(".");
    if (namespace.length === 0) {
      return null;
    }
    for (const symbol of this.index.allSymbols()) {
      if (symbol.namespace === namespace && symbol.fileId === symbol.sourceFileId) {
        return { uri: pathToUri(this.index.filePath(symbol.fileId)), range: zeroRange2() };
      }
    }
    return null;
  }
  symbolLocation(symbol) {
    const fileId = symbol.sourceFileId === 0 ? symbol.fileId : symbol.sourceFileId;
    return {
      uri: pathToUri(this.index.filePath(fileId)),
      range: {
        start: { line: symbol.line, character: symbol.column },
        end: { line: symbol.line, character: symbol.column + symbol.name.length }
      }
    };
  }
  toLocation(location) {
    const start = { line: location.line, character: location.column };
    return { uri: pathToUri(this.index.filePath(location.fileId)), range: { start, end: start } };
  }
};
function uriToPath(uri) {
  return uri.startsWith("file:") ? fileURLToPath(uri) : uri;
}
function pathToUri(filePath) {
  return pathToFileURL(filePath).toString();
}
function documentSymbolKind(kind) {
  if (kind === "mixin") return SymbolKind2.Module;
  if (kind === "group" || kind === "hookPhase") return SymbolKind2.Namespace;
  if (kind === "event" || kind === "channel") return SymbolKind2.Event;
  return SymbolKind2.Method;
}
function selectionRange(line2, character, length) {
  return {
    start: { line: line2, character },
    end: { line: line2, character: character + length }
  };
}
function range(line2, character, source2) {
  const lastLine = source2.split("\n").length - 1;
  return {
    start: { line: line2, character },
    end: { line: lastLine, character: (source2.split("\n")[lastLine] ?? "").length }
  };
}
function shortName(fullName) {
  const dot = fullName.lastIndexOf(".");
  return dot < 0 ? fullName : fullName.slice(dot + 1);
}
function dedupe(locations) {
  const seen = /* @__PURE__ */ new Set();
  return locations.filter((location) => {
    const key = `${location.fileId}:${location.line}:${location.column}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
function zeroRange2() {
  return { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
}
function placeholder(fullName) {
  return {
    id: 0,
    name: shortName(fullName),
    fullName,
    namespace: "",
    kind: "action" /* Action */,
    fileId: 0,
    sourceFileId: 0,
    line: 0,
    column: 0
  };
}

// src/lsp/transport.ts
var MessageFormatError = class extends Error {
};
var Transport = class {
  constructor(readable, writable) {
    this.writable = writable;
    this.iterator = readable[Symbol.asyncIterator]();
  }
  writable;
  buffer = Buffer.alloc(0);
  iterator;
  async read() {
    while (true) {
      const message = this.takeMessage();
      if (message !== void 0) {
        return message;
      }
      const next = await this.iterator.next();
      if (next.done === true) {
        return void 0;
      }
      this.buffer = Buffer.concat([this.buffer, next.value]);
    }
  }
  writeResult(id, result) {
    this.send({ jsonrpc: "2.0", id, result });
  }
  writeError(id, code, message) {
    this.send({ jsonrpc: "2.0", id, error: { code, message } });
  }
  writeNotification(method, params) {
    this.send({ jsonrpc: "2.0", method, params });
  }
  writeRequest(id, method, params) {
    this.send({ jsonrpc: "2.0", id, method, params });
  }
  send(payload) {
    const body = Buffer.from(JSON.stringify(payload), "utf8");
    const header = Buffer.from(`Content-Length: ${body.length}\r
\r
`, "utf8");
    this.writable.write(Buffer.concat([header, body]));
  }
  takeMessage() {
    const headerEnd = this.buffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) {
      return void 0;
    }
    const header = this.buffer.subarray(0, headerEnd).toString("utf8");
    const length = contentLength(header);
    const start = headerEnd + 4;
    const end = start + length;
    if (this.buffer.length < end) {
      return void 0;
    }
    const body = this.buffer.subarray(start, end);
    this.buffer = this.buffer.subarray(end);
    return body;
  }
  discardBuffer() {
    this.buffer = Buffer.alloc(0);
  }
};
function contentLength(header) {
  for (const rawLine of header.split("\r\n")) {
    const separator = rawLine.indexOf(":");
    if (separator < 0) {
      continue;
    }
    if (rawLine.slice(0, separator).trim().toLowerCase() !== "content-length") {
      continue;
    }
    const value = Number.parseInt(rawLine.slice(separator + 1).trim(), 10);
    if (!Number.isInteger(value) || value < 0) {
      throw new MessageFormatError("invalid Content-Length header");
    }
    return value;
  }
  throw new MessageFormatError("missing Content-Length header");
}

// src/lsp/typescript-bridge.ts
import { execFileSync, spawn } from "node:child_process";
import fs3 from "node:fs";
import path2 from "node:path";
import { fileURLToPath as fileURLToPath2, pathToFileURL as pathToFileURL2 } from "node:url";

// src/log.ts
function log(message) {
  process.stderr.write(`[moleculer-lsp] ${message}
`);
}

// src/lsp/typescript-bridge.ts
var requestTimeoutMs = 15e3;
var maxConsecutiveTimeouts = 2;
function resolveTypeScriptCommand(rootPath, searchPath = process.env.PATH ?? "") {
  const tsc = findExecutable("tsc", rootPath, searchPath);
  if (tsc !== void 0 && speaksLsp(tsc)) {
    return { command: tsc, args: ["--lsp", "--stdio"] };
  }
  const server = findExecutable("typescript-language-server", rootPath, searchPath);
  return server === void 0 ? void 0 : { command: server, args: ["--stdio"] };
}
var TypeScriptBridge = class {
  constructor(command, rootPath) {
    this.command = command;
    this.rootPath = rootPath;
  }
  command;
  rootPath;
  transport;
  child;
  ready;
  pending = /* @__PURE__ */ new Map();
  texts = /* @__PURE__ */ new Map();
  versions = /* @__PURE__ */ new Map();
  nextId = 1;
  consecutiveTimeouts = 0;
  track(uri, text) {
    this.texts.set(uri, text);
    const version2 = this.versions.get(uri);
    if (version2 === void 0 || this.transport === void 0) {
      return;
    }
    this.versions.set(uri, version2 + 1);
    this.transport.writeNotification("textDocument/didChange", {
      textDocument: { uri, version: version2 + 1 },
      contentChanges: [{ text }]
    });
  }
  forget(uri) {
    this.texts.delete(uri);
    this.close(uri);
  }
  async request(method, params, uri) {
    if (!await this.start()) {
      return null;
    }
    const temporary = !this.texts.has(uri);
    this.open(uri);
    const result = await this.send(method, withoutProgressTokens(params));
    if (temporary && !this.texts.has(uri)) {
      this.close(uri);
    }
    return result;
  }
  stop() {
    this.shutdown(void 0);
  }
  start() {
    if (this.ready === void 0) {
      this.ready = this.launch();
    }
    return this.ready;
  }
  async launch() {
    let child;
    try {
      child = spawn(this.command.command, this.command.args, {
        cwd: this.rootPath,
        stdio: ["pipe", "pipe", "ignore"]
      });
    } catch (error) {
      log(`typescript fallback stopped: cannot start ${this.command.command}: ${messageOf(error)}`);
      this.ready = Promise.resolve(false);
      return false;
    }
    child.on("error", (error) => this.shutdown(`process error: ${error.message}`));
    child.on("exit", (code, signal) => this.shutdown(`process exited (${code ?? signal})`));
    child.stdin?.on("error", (error) => this.shutdown(`input closed: ${error.message}`));
    if (child.stdin === null || child.stdout === null) {
      this.shutdown("process has no stdio pipes");
      return false;
    }
    this.child = child;
    this.transport = new Transport(child.stdout, child.stdin);
    void this.listen(this.transport);
    const result = await this.send("initialize", {
      processId: process.pid,
      rootUri: pathToFileURL2(this.rootPath).toString(),
      capabilities: {}
    });
    if (result === null || this.transport === void 0) {
      this.shutdown("initialize failed");
      return false;
    }
    this.transport.writeNotification("initialized", {});
    return true;
  }
  shutdown(reason) {
    const child = this.child;
    const active = child !== void 0 || this.transport !== void 0;
    this.transport = void 0;
    this.child = void 0;
    this.ready = Promise.resolve(false);
    this.versions.clear();
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.resolve(null);
      this.pending.delete(id);
    }
    if (child !== void 0) {
      child.stdin?.destroy();
      child.kill();
    }
    if (active && reason !== void 0) {
      log(`typescript fallback stopped: ${reason}`);
    }
  }
  send(method, params) {
    const transport = this.transport;
    if (transport === void 0) {
      return Promise.resolve(null);
    }
    const id = this.nextId++;
    return new Promise((resolve3) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve3(null);
        this.consecutiveTimeouts += 1;
        if (this.consecutiveTimeouts >= maxConsecutiveTimeouts) {
          this.shutdown(`${this.consecutiveTimeouts} requests timed out after ${requestTimeoutMs} ms`);
        }
      }, requestTimeoutMs);
      timer.unref();
      this.pending.set(id, { resolve: resolve3, timer });
      transport.writeRequest(id, method, params);
    });
  }
  async listen(transport) {
    while (this.transport === transport) {
      let body;
      try {
        body = await transport.read();
      } catch (error) {
        this.shutdown(`malformed message: ${messageOf(error)}`);
        return;
      }
      if (body === void 0) {
        this.shutdown("output closed");
        return;
      }
      let message;
      try {
        message = JSON.parse(body.toString("utf8"));
      } catch {
        continue;
      }
      if (isRecord(message)) {
        this.receive(transport, message);
      }
    }
  }
  receive(transport, message) {
    if (typeof message.method === "string") {
      if (message.id !== void 0) {
        transport.writeResult(message.id, replyFor(message.method, message.params));
      }
      return;
    }
    if (typeof message.id !== "number") {
      return;
    }
    const pending = this.pending.get(message.id);
    if (pending === void 0) {
      return;
    }
    this.pending.delete(message.id);
    this.consecutiveTimeouts = 0;
    clearTimeout(pending.timer);
    pending.resolve(message.error === void 0 ? message.result ?? null : null);
  }
  open(uri) {
    if (this.versions.has(uri) || this.transport === void 0) {
      return;
    }
    const text = this.texts.get(uri) ?? readText(uri);
    if (text === void 0) {
      return;
    }
    this.versions.set(uri, 1);
    this.transport.writeNotification("textDocument/didOpen", {
      textDocument: { uri, languageId: languageIdFor(uri), version: 1, text }
    });
  }
  close(uri) {
    if (this.versions.delete(uri) && this.transport !== void 0) {
      this.transport.writeNotification("textDocument/didClose", { textDocument: { uri } });
    }
  }
};
function withoutProgressTokens(params) {
  if (!isRecord(params)) {
    return params;
  }
  const { workDoneToken, partialResultToken, ...rest } = params;
  return rest;
}
function replyFor(method, params) {
  if (method === "workspace/configuration" && isRecord(params) && Array.isArray(params.items)) {
    return params.items.map(() => null);
  }
  return null;
}
function readText(uri) {
  try {
    return fs3.readFileSync(fileURLToPath2(uri), "utf8");
  } catch {
    return void 0;
  }
}
function languageIdFor(uri) {
  const extension = path2.extname(uri).toLowerCase();
  if (extension === ".ts" || extension === ".mts" || extension === ".cts") return "typescript";
  if (extension === ".tsx") return "typescriptreact";
  if (extension === ".jsx") return "javascriptreact";
  return "javascript";
}
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
function findExecutable(name, rootPath, searchPath) {
  const directories = [path2.join(rootPath, "node_modules", ".bin"), ...searchPath.split(path2.delimiter)];
  for (const directory of directories) {
    if (!path2.isAbsolute(directory)) {
      continue;
    }
    const candidate = path2.join(directory, name);
    try {
      fs3.accessSync(candidate, fs3.constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }
  return void 0;
}
function speaksLsp(tscPath) {
  try {
    const output = execFileSync(tscPath, ["--version"], {
      encoding: "utf8",
      timeout: 5e3,
      stdio: ["ignore", "pipe", "ignore"]
    });
    const major = /Version (\d+)\./.exec(output)?.[1];
    if (major !== void 0) {
      return Number(major) >= 7;
    }
  } catch {
    return shipsWithoutTsserver(tscPath);
  }
  return shipsWithoutTsserver(tscPath);
}
function shipsWithoutTsserver(tscPath) {
  let packageDir;
  try {
    packageDir = path2.resolve(path2.dirname(fs3.realpathSync(tscPath)), "..");
  } catch {
    return false;
  }
  return fs3.existsSync(path2.join(packageDir, "package.json")) && !fs3.existsSync(path2.join(packageDir, "lib", "tsserver.js"));
}

// package.json
var package_default = {
  name: "moleculer-lsp",
  version: "0.2.0",
  description: "Language server for Moleculer.js: go to definition, find references, document symbols and diagnostics across services, mixins and events",
  keywords: [
    "moleculer",
    "moleculerjs",
    "lsp",
    "language-server",
    "microservices",
    "javascript"
  ],
  homepage: "https://github.com/Anshuman115/moleculer-lsp#readme",
  bugs: {
    url: "https://github.com/Anshuman115/moleculer-lsp/issues"
  },
  repository: {
    type: "git",
    url: "git+https://github.com/Anshuman115/moleculer-lsp.git"
  },
  license: "Apache-2.0",
  author: "Anshuman Tripathy",
  type: "module",
  main: "dist/main.js",
  bin: {
    "moleculer-lsp": "dist/main.js"
  },
  files: [
    "dist"
  ],
  engines: {
    node: ">=18"
  },
  scripts: {
    build: "tsc --noEmit && npm run bundle",
    bundle: `esbuild src/main.ts --bundle --platform=node --target=node18 --format=esm --outfile=dist/main.js --banner:js="import{createRequire}from'node:module';const require=createRequire(import.meta.url);"`,
    typecheck: "tsc --noEmit",
    test: "vitest run src",
    dev: "tsx src/main.ts",
    prepublishOnly: "npm run build && npm test"
  },
  devDependencies: {
    "@types/node": "^22.10.2",
    acorn: "^8.16.0",
    chokidar: "^4.0.3",
    esbuild: "^0.28.1",
    tsx: "^4.19.2",
    typescript: "^5.7.2",
    vitest: "^2.1.8"
  }
};

// src/version.ts
var VERSION = package_default.version;

// src/lsp/server.ts
var Server = class {
  constructor(readable, writable, options = {}) {
    this.options = options;
    this.transport = new Transport(readable, writable);
    this.watcher = new Watcher(() => this.rescan());
  }
  options;
  index = new Index();
  scanner = new Scanner(this.index);
  handlers = new Handlers(this.index, this.scanner);
  watcher;
  transport;
  queued = [];
  published = /* @__PURE__ */ new Set();
  rootPath = process.cwd();
  scanState = "pending" /* Pending */;
  scanError = "";
  pullDiagnostics = false;
  refreshSupport = false;
  nextServerRequestId = 1;
  bridge;
  async run() {
    while (true) {
      let body;
      try {
        body = await this.transport.read();
      } catch (error) {
        if (error instanceof MessageFormatError) {
          this.transport.discardBuffer();
          this.transport.writeError(null, ErrorCodes.ParseError, error.message);
          continue;
        }
        throw error;
      }
      if (body === void 0) {
        this.watcher.close();
        this.bridge?.stop();
        return;
      }
      let message;
      try {
        message = JSON.parse(body.toString("utf8"));
      } catch {
        this.transport.writeError(null, ErrorCodes.ParseError, "invalid JSON-RPC message");
        continue;
      }
      this.dispatch(message);
    }
  }
  dispatch(message) {
    try {
      this.route(message);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      log(`request failed: ${message.method}: ${text}`);
      if (message.id !== void 0) {
        this.transport.writeError(message.id, ErrorCodes.InternalError, text);
      }
    }
  }
  route(message) {
    if (typeof message.method !== "string") {
      return;
    }
    switch (message.method) {
      case "initialize":
        this.initialize(message);
        return;
      case "initialized":
        this.startScan();
        return;
      case "shutdown":
        this.watcher.close();
        this.bridge?.stop();
        this.transport.writeResult(message.id, null);
        return;
      case "exit":
        this.watcher.close();
        this.bridge?.stop();
        process.exit(0);
      case "textDocument/didOpen":
        this.didOpen(message.params);
        return;
      case "textDocument/didChange":
        this.didChange(message.params);
        return;
      case "textDocument/didSave":
        this.didSave();
        return;
      case "textDocument/didClose":
        this.didClose(message.params);
        return;
      case "textDocument/definition":
      case "textDocument/references":
        this.documentRequest(message);
        return;
      case "textDocument/documentSymbol":
        this.documentSymbolRequest(message);
        return;
      case "textDocument/diagnostic":
        this.diagnosticRequest(message);
        return;
      default:
        if (message.id !== void 0) {
          this.transport.writeError(message.id, ErrorCodes.MethodNotFound, `method not found: ${message.method}`);
        }
    }
  }
  initialize(message) {
    const params = isRecord(message.params) ? message.params : {};
    const rootUri = typeof params.rootUri === "string" ? params.rootUri : "";
    if (rootUri.length > 0) {
      this.rootPath = fileURLToPath3(rootUri);
    } else if (Array.isArray(params.workspaceFolders)) {
      const first = params.workspaceFolders[0];
      if (isRecord(first) && typeof first.uri === "string") {
        this.rootPath = fileURLToPath3(first.uri);
      }
    }
    const capabilities = isRecord(params.capabilities) ? params.capabilities : {};
    const textDocument2 = isRecord(capabilities.textDocument) ? capabilities.textDocument : {};
    const workspace = isRecord(capabilities.workspace) ? capabilities.workspace : {};
    const workspaceDiagnostics = isRecord(workspace.diagnostics) ? workspace.diagnostics : {};
    this.pullDiagnostics = isRecord(textDocument2.diagnostic);
    this.refreshSupport = workspaceDiagnostics.refreshSupport === true;
    this.bridge = this.createBridge();
    this.transport.writeResult(message.id, {
      capabilities: {
        textDocumentSync: { openClose: true, change: 1, save: true },
        definitionProvider: true,
        referencesProvider: true,
        documentSymbolProvider: true,
        ...this.pullDiagnostics ? { diagnosticProvider: { interFileDependencies: true, workspaceDiagnostics: false } } : {}
      },
      serverInfo: { name: "moleculer-lsp", version: VERSION }
    });
  }
  startScan() {
    setTimeout(() => {
      const started = Date.now();
      try {
        const result = this.scanner.scan(this.rootPath);
        this.scanState = "ready" /* Ready */;
        const stats = this.index.stats();
        log(`indexed ${stats.symbolCount} symbols in ${result.fileCount} files (${Date.now() - started}ms)`);
        log(`references ${stats.referenceCount}, unresolved ${result.dropped.length}, mixin failures ${result.mixinFailures.length}`);
        this.watcher.watch(this.rootPath);
      } catch (error) {
        this.scanState = "failed" /* Failed */;
        this.scanError = error instanceof Error ? error.message : String(error);
        log(`scan failed: ${this.scanError}`);
      }
      this.flushQueued();
      if (this.scanState === "ready" /* Ready */) {
        this.publishDiagnostics();
      }
    }, 0);
  }
  rescan() {
    try {
      this.scanner.scan(this.rootPath);
      this.scanState = "ready" /* Ready */;
      this.publishDiagnostics();
    } catch (error) {
      log(`rescan failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  flushQueued() {
    for (const message of this.queued.splice(0)) {
      this.dispatch(message);
    }
  }
  documentRequest(message) {
    if (this.scanState === "pending" /* Pending */) {
      this.queued.push(message);
      return;
    }
    if (this.scanState === "failed" /* Failed */) {
      this.transport.writeError(message.id, ErrorCodes.ServerNotInitialized, `index unavailable: ${this.scanError}`);
      return;
    }
    const result = message.method === "textDocument/definition" ? this.handlers.definition(positionParams(message.params)) : this.handlers.references(referenceParams(message.params));
    this.respond(message, result);
  }
  respond(message, result) {
    const uri = textDocument(message.params)?.uri;
    if (this.bridge === void 0 || uri === void 0 || !isEmpty(result)) {
      this.transport.writeResult(message.id, result);
      return;
    }
    void this.bridge.request(message.method, message.params, uri).then(
      (fallback) => this.transport.writeResult(message.id, isEmpty(fallback) ? result : fallback),
      () => this.transport.writeResult(message.id, result)
    );
  }
  createBridge() {
    const setting = this.options.typescriptFallback;
    if (setting === void 0 || setting === false) {
      return void 0;
    }
    const command = setting === true ? resolveTypeScriptCommand(this.rootPath) : setting;
    if (command === void 0) {
      log("typescript fallback disabled: no tsc with --lsp or typescript-language-server found");
      return void 0;
    }
    log(`typescript fallback: ${command.command} ${command.args.join(" ")}`);
    return new TypeScriptBridge(command, this.rootPath);
  }
  documentSymbolRequest(message) {
    if (this.scanState === "pending" /* Pending */) {
      this.queued.push(message);
      return;
    }
    if (this.scanState === "failed" /* Failed */) {
      this.transport.writeError(message.id, ErrorCodes.ServerNotInitialized, `index unavailable: ${this.scanError}`);
      return;
    }
    this.respond(message, this.handlers.documentSymbols(documentSymbolParams(message.params)));
  }
  diagnosticRequest(message) {
    if (this.scanState === "pending" /* Pending */) {
      this.queued.push(message);
      return;
    }
    if (this.scanState === "failed" /* Failed */) {
      this.transport.writeResult(message.id, { kind: "full", items: [] });
      return;
    }
    const document = textDocument(message.params);
    if (document === void 0) {
      this.transport.writeError(message.id, ErrorCodes.InvalidParams, "textDocument/diagnostic requires a document uri");
      return;
    }
    const fileId = this.index.fileIdOf(uriToPath(document.uri));
    const items = fileId === void 0 ? [] : diagnosticsByFile(this.index, this.scanner).get(fileId) ?? [];
    this.transport.writeResult(message.id, { kind: "full", items });
  }
  didOpen(params) {
    const document = textDocument(params);
    if (document !== void 0 && typeof document.text === "string") {
      this.handlers.openDocument(document.uri, document.text);
      this.bridge?.track(document.uri, document.text);
    }
  }
  didChange(params) {
    const record = isRecord(params) ? params : {};
    const document = textDocument(params);
    const changes = Array.isArray(record.contentChanges) ? record.contentChanges : [];
    const latest = changes[changes.length - 1];
    if (document !== void 0 && isRecord(latest) && typeof latest.text === "string") {
      this.handlers.openDocument(document.uri, latest.text);
      this.bridge?.track(document.uri, latest.text);
    }
  }
  didSave() {
    this.rescan();
  }
  didClose(params) {
    const document = textDocument(params);
    if (document !== void 0) {
      this.handlers.closeDocument(document.uri);
      this.bridge?.forget(document.uri);
    }
  }
  publishDiagnostics() {
    if (this.pullDiagnostics) {
      if (this.refreshSupport) {
        this.transport.writeRequest(this.nextServerRequestId++, "workspace/diagnostic/refresh", {});
      }
      return;
    }
    const byFile = diagnosticsByFile(this.index, this.scanner);
    const current2 = /* @__PURE__ */ new Set();
    for (const [fileId, diagnostics] of byFile) {
      const uri = pathUri(this.index.filePath(fileId));
      current2.add(uri);
      this.transport.writeNotification("textDocument/publishDiagnostics", { uri, diagnostics });
    }
    for (const uri of this.published) {
      if (!current2.has(uri)) {
        this.transport.writeNotification("textDocument/publishDiagnostics", { uri, diagnostics: [] });
      }
    }
    this.published.clear();
    for (const uri of current2) {
      this.published.add(uri);
    }
  }
};
function textDocument(params) {
  const record = isRecord(params) ? params : {};
  const document = isRecord(record.textDocument) ? record.textDocument : void 0;
  if (document === void 0 || typeof document.uri !== "string") {
    return void 0;
  }
  return { uri: document.uri, text: document.text };
}
function positionParams(params) {
  const record = isRecord(params) ? params : {};
  const document = isRecord(record.textDocument) ? record.textDocument : {};
  const position = isRecord(record.position) ? record.position : {};
  return {
    textDocument: { uri: typeof document.uri === "string" ? document.uri : "" },
    position: {
      line: typeof position.line === "number" ? position.line : 0,
      character: typeof position.character === "number" ? position.character : 0
    }
  };
}
function referenceParams(params) {
  const record = isRecord(params) ? params : {};
  const context = isRecord(record.context) ? record.context : {};
  return {
    ...positionParams(params),
    context: { includeDeclaration: context.includeDeclaration === true }
  };
}
function documentSymbolParams(params) {
  const document = textDocument(params);
  return { textDocument: { uri: document?.uri ?? "" } };
}
function isEmpty(result) {
  return result === null || result === void 0 || Array.isArray(result) && result.length === 0;
}
function pathUri(filePath) {
  return new URL(`file://${filePath}`).toString();
}

// src/main.ts
var usage = `Usage: moleculer-lsp [options]

Options:
  --stdio                  Start the language server over stdio (default)
  --typescript-fallback    Send definition, references and symbol requests the index cannot answer to TypeScript
  --scan <dir>             Index a workspace and print a summary
  --parse <file>           Print symbols and references for one file
  --version                Print the version
  --help                   Print this help
`;
var typescriptFallbackFlag = "--typescript-fallback";
async function main(args) {
  const command = args.find((arg) => arg !== typescriptFallbackFlag && !arg.startsWith("--stdio"));
  if (command === "--version") {
    process.stdout.write(`moleculer-lsp ${VERSION}
`);
    return;
  }
  if (command === "--help" || command === "-h") {
    process.stdout.write(usage);
    return;
  }
  if (command === "--parse") {
    parseFile(args[args.indexOf("--parse") + 1]);
    return;
  }
  if (command === "--scan") {
    scanWorkspace(args[args.indexOf("--scan") + 1]);
    return;
  }
  await new Server(process.stdin, process.stdout, { typescriptFallback: args.includes(typescriptFallbackFlag) }).run();
}
function parseFile(filePath) {
  if (filePath === void 0) {
    throw new Error("usage: moleculer-lsp --parse <file>");
  }
  const result = new MoleculerParser().parse(filePath, fs4.readFileSync(filePath, "utf8"));
  process.stdout.write(`file: ${filePath}
service: ${result.isService}
`);
  process.stdout.write("symbols:\n");
  for (const symbol of result.symbols) {
    process.stdout.write(`  ${symbol.fullName} [${symbol.kind}] ${symbol.line + 1}:${symbol.column + 1}
`);
  }
  process.stdout.write("references:\n");
  for (const reference of result.references) {
    process.stdout.write(`  ${reference.fullName} [${reference.kind}] ${reference.location.line + 1}:${reference.location.column + 1}
`);
  }
  process.stdout.write("mixins:\n");
  for (const mixin of result.mixins) {
    process.stdout.write(`  ${mixin.mixinName} -> ${mixin.requirePath}
`);
  }
}
function scanWorkspace(rootPath) {
  if (rootPath === void 0) {
    throw new Error("usage: moleculer-lsp --scan <root>");
  }
  const index = new Index();
  const scanner = new Scanner(index);
  const started = Date.now();
  const result = scanner.scan(rootPath);
  const stats = index.stats();
  process.stdout.write(`root: ${rootPath}
`);
  process.stdout.write(`files: ${result.fileCount}
`);
  process.stdout.write(`symbols: ${stats.symbolCount}
`);
  process.stdout.write(`references: ${stats.referenceCount}
`);
  process.stdout.write(`elapsed: ${Date.now() - started}ms
`);
  process.stdout.write(`mixin failures: ${result.mixinFailures.length}
`);
  process.stdout.write(`unresolved references: ${result.dropped.length}
`);
  const byReason = /* @__PURE__ */ new Map();
  for (const dropped of result.dropped) {
    byReason.set(dropped.reason, (byReason.get(dropped.reason) ?? 0) + 1);
  }
  for (const [reason, count] of [...byReason].sort((a, b) => b[1] - a[1])) {
    process.stdout.write(`  ${reason}: ${count}
`);
  }
}
main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`[moleculer-lsp] ${error instanceof Error ? error.message : String(error)}
`);
  process.exit(1);
});
/*! Bundled license information:

chokidar/esm/index.js:
  (*! chokidar - MIT License (c) 2012 Paul Miller (paulmillr.com) *)
*/
