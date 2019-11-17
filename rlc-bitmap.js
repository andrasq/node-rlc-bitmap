/*
 * experimental RLC bitmap manager
 * The bitmap is run-length coded as pairs of runs, the first all 0 bits the second all 1 bits.
 *
 * 2019-11-17 - AR.
 */

'use strict';

module.exports = RlcBitmap;

function RlcBitmap( options ) {
    options = options || {};
    if (!(options.height > 0) || !(options.width > 0)) throw new Error('width, height required');
    this.width = options.width;
    this.height = options.height;

    this.cacheMaxItems = options.cacheMaxItems || this.height * .05;
    this.rlcEvenRunValue = 0;
    this.rlcOddRunValue = 1;
    this.BitArray = Uint8Array;
    this.RlcArray = Uint16Array;
    this.maxRunLength = 65000;

    this.store = new Array(options.height);
    this.cache = {};
    this.cacheRows = new Array();

    // use a zero-filled bitrow to initialize the bitmap
    var bitrow = new this.BitArray(this.width);
    for (var i = 0; i < this.height; i++) {
        this.setRow(bitrow, i);
    }
}

RlcBitmap.prototype.getRow = function getRow( n ) {
    if (n < 0 || n > this.height) throw new Error(n + ': row out of bounds');
    if (!this.cache[n]) {
        this.freeCacheSpace(1);
        this.cache[n] = {
            rowId: n,
            modified: false,
            data: this.rlcDecode(this.store[n]),
        };
        this.cacheRows.push(n);
    }
    return this.cache[n].data;
}

RlcBitmap.prototype.setRow = function setRow( row, n ) {
    if (n < 0 || n > this.height) throw new Error(n + ': row out of bounds');
    this.store[n] = this.rlcEncode(row);
    // note: invalidate (or update, like below) a new row
    // if (this.cache[n]) delete this.cache[n];
    if (this.cache[n]) {
        this.cache[n].data = row;
        this.cache[n].modified = true;
    }
}

RlcBitmap.prototype.get = function get( x, y ) {
    var row = this.getRow(y);
    return row[x];
}

RlcBitmap.prototype.set = function set( x, y, onOff ) {
    var row = this.getRow(y);
    row[x] = onOff;
    if (this.cache[y]) this.cache[y].modified = true;
}

RlcBitmap.prototype.freeCacheSpace = function freeCacheSpace( nitems ) {
    while (this.cacheRows.length + nitems > this.cacheMaxItems) {
        // primitive LRU, evicts oldest cached row first
        var rowId = this.cacheRows.shift();
        var row = this.cache[rowId];
        delete this.cache[rowId];

        // re-compress modified rows upon eviction
        // if (row.modified) this.setRow(row, rowId);
        if (row.modified) this.store[rowId] = this.rlcEncode(row.data);
    }
}

RlcBitmap.prototype.flushChanges = function flushChanges( ) {
    // write back modified rows to the rlc store
    for (var i = 0; i < this.cacheRows.length; i++) {
        var row = this.cache[i];
        if (row.modified) this.store[i] = this.rlcEncode(row.data);
    }
    // TODO: maybe just clear the cache?
    // this.freeCacheSpace(this.cacheMaxItems);
}

RlcBitmap.prototype.rlcDecode = function rlcDecode( rlc ) {
    var bitrow = new this.BitArray(this.width);
    var biti = 0;

    // unpack the run-length-coded row into even- and odd-position bit vectors
    // we do not check that the rlc decodes into the right length bit vector
    for (var i = 0; i < rlc.length; i += 2) {
        var end0 = rlc[i];
        var end1 = rlc[i + 1];
        for (var j = 0; j < end0; j++) bitrow[biti++] = this.rlcEvenRunValue;
        for (var j = 0; j < end1; j++) bitrow[biti++] = this.rlcOddRunValue;
    }

    return bitrow;
}

RlcBitmap.prototype.rlcEncode = function rlcEncode( bitrow ) {
    // encode into an Array to be able to extend as needed
    var rlc = new Array();
    var rlci = 0;
    var rowi = 0;

    // even rlc offset is always a vector of evenBit values, even if 0 length
    if (bitrow[0] !== this.rlcEvenRunValue) rlc.push(0);

    // other runs alternate oddBit and evenBit values
    while (rowi < bitrow.length) {
        var end = this.findRunEnd(bitrow, rowi);
        rlc.push(end - rowi);
        // emit a zero-length other-color run between segments of an overlong run
        if (bitrow[end] === bitrow[rowi]) rlc.push(0);
        rowi = end;
    }

    // always generate an even number of runs
    if (rowi % 2 === 0) rlc.push(0);

    return new this.RlcArray(rlc);
}

/*
 * find the end of the run of identical values that start at row offset `start`
 * The end is the offset of the first value that does not match the start value.
 * The returned `end` will be no more than maxRunLength positions from `start`.
 */
RlcBitmap.prototype.findRunEnd = function findRunEnd( row, start ) {
    var val = row[start];
    var end = start + 1;
    var limit = start + this.maxRunLength;
    while (row[end] === val && end < limit) end++;
    return end;
}

/*
 * for manual testing, spot-check the bitmap by converting it to an image
 */
RlcBitmap.prototype.toString = function toString( ) {
    var str = '';
    for (var i = 0; i < this.store.length; i++) {
        var bitrow = this.cache[i] && this.cache[i].data || this.rlcDecode(this.store[i]);
        // Uint8Array does not map()
        for (var j = 0; j < bitrow.length; j++) str += bitrow[j] && '@' || '.';
        str += '\n';
    }
    return str;
}


if (process.env.NODE_ENV === 'TEST') {
var map = new RlcBitmap({ width: 50, height: 20, cacheMaxItems: 20 });
map.set(3, 2, 1);
map.set(3, 3, 1);
map.set(3, 4, 1);
map.set(3, 5, 1);
console.log(map.toString());

var qtimeit = require('qtimeit');
qtimeit(10000, function() {
    for (var i=0; i<map.height; i++) map.set(i, i, 1);
    // best case, always in cache:
    // 61m bits / sec 5000x3000
    // worst case, never in cache:
    // 657k bits / sec 50x30
    // 141k bits / sec 500x300
    // 17k bits / sec 5000x3000
    // 8.3k bits / sec 10400x10400 (751k x 144)
});
map.flushChanges();
console.log("AR:", map);
}
