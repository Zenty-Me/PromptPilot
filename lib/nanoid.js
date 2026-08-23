var nanoid = (function () {
  var urlAlphabet =
    "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";

  function customAlphabet(alphabet, defaultSize) {
    defaultSize = defaultSize || 21;
    return function (size) {
      size = size || defaultSize;
      var id = "";
      var i = size | 0;
      while (i--) {
        id += alphabet[(Math.random() * alphabet.length) | 0];
      }
      return id;
    };
  }

  function nanoid(size) {
    size = size || 21;
    var id = "";
    var i = size | 0;
    while (i--) {
      id += urlAlphabet[(Math.random() * 64) | 0];
    }
    return id;
  }

  return nanoid;
})();
