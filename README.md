Rlc-Bitmap
==========

Run-length-coded bitmap store.

    RlcBitmap = require('rlc-bitmap');
    bitmap = new RlcBitmap({ width: 100, height: 75 });
    bitmap.set(3, 2);


Api
---

### map = new RlcBitmap( options )

Create a new bitmap of the specified dimensions.

Options:
- `width`
- `height`

### map.set( x, y, onOff )

Set / clear the value of the bit at position `x,y`.

### map.get( x, y )

Get the value of the bit at position `x,y`.
