// Simulate bind() on platforms that don't have it. Copied from https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Function/bind
if (!Function.prototype.bind) {
  Function.prototype.bind = function (oThis) {
    // closest thing possible to the ECMAScript 5 internal IsCallable function
    if (typeof this !== "function")
      throw new TypeError("Function.prototype.bind - what is trying to be fBound is not callable");

    var aArgs = Array.prototype.slice.call(arguments, 1),
      fToBind = this,
      fNOP = function () {},
      fBound = function () {
        return fToBind.apply(this instanceof fNOP ? this : oThis || window, aArgs.concat(Array.prototype.slice.call(arguments)));
      };

    fNOP.prototype = this.prototype;
    fBound.prototype = new fNOP();

    return fBound;
  };
}

var OS = {
  MAC: "mac",
  WIN: "win",
  UNKNOWN: "unknown"
}
var platform = navigator.platform;
var os;
if (platform.match(/Mac.*/))
  os = OS.MAC;
else if (platform.match(/Win.*/))
  os = OS.WIN;
else
  os = OS.UNKNOWN;

console.log("os: " + os);

Editor = function() {};

var LEFT = false;
var RIGHT = true;
var UP = false;
var DOWN = true;

var KeyCodes = {
  "backspace": 8,
  "tab": 9,
  "delete": 46,
  "return": 13,
  "left": 37,
  "up": 38,
  "right": 39,
  "down": 40,
  "home": 36,
  "end": 35,
  "a": 65,
  "e": 69,
  "k": 75
};

function modifierString(ctrlKey, altKey, shiftKey, metaKey) {
  var combo = "";
  if (ctrlKey)
    combo += "Ctrl";
  if (altKey)
    combo += "Alt";
  if (shiftKey)
    combo += "Shift";
  if (metaKey)
    combo += "Meta";
  return combo;
}

// The elements to decorate
Editor.prototype.editor_ = null;
Editor.prototype.caret_ = null;

// The content of the editor
Editor.prototype.lines_ = [];

// Editor attributes
Editor.prototype.showCaretTimer_ = 0;
Editor.prototype.cursorOffset_ = -1;
Editor.prototype.currentColumn_ = 0;
Editor.prototype.currentLine_ = 0;
Editor.prototype.caretX_ = 0;
Editor.prototype.caretY_ = 0;
Editor.prototype.cursorActive_ = false;
Editor.prototype.selectionStart_ = -1;
Editor.prototype.textLength_ = 0;

// Keep track of the listener functions to add/remove on focus/blur
Editor.prototype.keydownListener_ = 0;
Editor.prototype.keypressListener_ = 0;

Editor.prototype.decorate = function(editor, caret) {
  this.editor_ = editor;
  // TODO(aboxhall) split editor into divs
  // assume text content needs to be split up regardless
  var lines = editor.textContent.split("\n");
  editor.innerHTML = "";
  for (var i = 0; i < lines.length; i++) {
    var content = document.createTextNode(lines[i]);
    var line = document.createElement("div");
    line.appendChild(content);
    this.lines_.push(line);
    editor.appendChild(line);
  }

  this.caret_ = caret;  // NOTE(aboxhall): create caret element?
  this.textLength_ = editor.textContent.length;

  // If focus comes from a click, give the click event a chance to set the
  // selection before setting the cursor position
  editor.addEventListener("focus", function (event) {
    // Only listen for keystrokes when focused.
    this.keydownListener_ = this.cursor.bind(this);
    this.keypressListener_ = this.type.bind(this);
    this.editor_.addEventListener("keydown", this.keydownListener_);
    this.editor_.addEventListener("keypress", this.keypressListener_);

    this.showCaretTimer_ = setTimeout(this.positionAndShowCaret.bind(this, event), 0);
  }.bind(this));
  editor.addEventListener("click", function (event) {
    this.showCaretTimer_ = setTimeout(this.positionAndShowCaret.bind(this, event), 0);
  }.bind(this));

  editor.addEventListener("blur", function () {
    this.editor_.removeEventListener("keydown", this.keydownListener_);
    this.editor_.removeEventListener("keypress", this.keypressListener_);
    this.keydownListener_ = 0;
    this.keypressListener_ = 0;
    this.hideCaret();
  }.bind(this));
  this.bindKeystrokes();
};

Editor.prototype.preventDefault_ = {};
Editor.prototype.action_ = {};

Editor.prototype.bindMappingPreventDefault = function(key, modifiers, callback) {
  var code = KeyCodes[key];
  this.preventDefault_[code] = this.preventDefault_[code] || {};
  this.preventDefault_[code][modifiers] = true;
  this.bindMapping(key, modifiers, callback);
};

Editor.prototype.bindMapping = function(key, modifiers, callback) {
  var code = KeyCodes[key];
  this.action_[code] = this.action_[code] || {};
  this.action_[code][modifiers] = callback;
};

Editor.prototype.bindKeystrokes = function() {
  this.bindMappingPreventDefault("backspace", "", this.backspace.bind(this));
  this.bindMapping("delete", "", this.del.bind(this));
  this.bindMapping("return", "", this.editor_.blur.bind(this.editor_));
  this.bindMapping("tab", "", this.editor_.blur.bind(this.editor_));
  this.bindMapping("up", "", this.moveCursorOneLine(this, UP));
  this.bindMapping("down", "", this.moveCursorOneLine(this, DOWN));


  if (os == OS.MAC) {
    this.bindMappingPreventDefault("backspace", "Alt", this.deleteOneWord.bind(this, LEFT));
    this.bindMappingPreventDefault("backspace", "Meta", this.deleteToEndOfLine.bind(this, LEFT));
    this.bindMapping("delete", "Alt", this.deleteOneWord.bind(this, RIGHT));
    this.bindMappingPreventDefault("delete", "Meta", this.deleteToEndOfLine.bind(this, RIGHT));
    this.bindMapping("a", "Ctrl", this.moveCursorToEndOfLine.bind(this, LEFT));
    this.bindMapping("e", "Ctrl", this.moveCursorToEndOfLine.bind(this, RIGHT));
    this.bindMapping("k", "Ctrl", this.deleteToEndOfLine.bind(this, RIGHT));
    this.bindMappingPreventDefault("a", "Meta", this.selectAll);
  } else if (os == OS.WIN) {
    this.bindMappingPreventDefault("backspace", "Ctrl", this.deleteOneWord.bind(this, LEFT));
    this.bindMapping("delete", "Ctrl", this.deleteOneWord.bind(this, RIGHT));
    this.bindMappingPreventDefault("a", "Ctrl", this.selectAll);
    this.bindMappingPreventDefault("home", "Shift", this.moveCursorToEndOfLine.bind(this, LEFT));
    this.bindMappingPreventDefault("home", "", this.moveCursorToEndOfLine.bind(this, LEFT));
    this.bindMappingPreventDefault("end", "Shift", this.moveCursorToEndOfLine.bind(this, RIGHT));
    this.bindMappingPreventDefault("end", "", this.moveCursorToEndOfLine.bind(this, RIGHT));
  }

  this.mapLeftRight("left", LEFT);
  this.mapLeftRight("right", RIGHT);
};

Editor.prototype.mapLeftRight = function(key, dir) {
  var direction = dir;
  this.bindMapping(key, "", this.moveCursorOneCharacter.bind(this, direction, false));
  this.bindMappingPreventDefault(key, "Shift", this.moveCursorOneCharacter.bind(this, direction, true));
  if (os == OS.MAC) {
    this.bindMapping(key, "Ctrl", this.moveCursorToEndOfLine.bind(this, direction));
    this.bindMappingPreventDefault(key, "Meta", this.moveCursorToEndOfLine.bind(this, direction));
    this.bindMapping(key, "Alt", this.moveCursorOneWord.bind(this, direction));
    this.bindMappingPreventDefault(key, "CtrlShift", this.moveCursorToEndOfLine.bind(this, direction));
    this.bindMappingPreventDefault(key, "ShiftMeta", this.moveCursorToEndOfLine.bind(this, direction));
    this.bindMappingPreventDefault(key, "AltShift", this.moveCursorOneWord.bind(this, direction));
  } else if (os == OS.WIN) {
    this.bindMapping(key, "Ctrl", this.moveCursorOneWord.bind(this, direction));
    this.bindMappingPreventDefault(key, "CtrlShift", this.moveCursorOneWord.bind(this, direction));
  }
};

Editor.prototype.positionAndShowCaret = function(event) {
  if (event.type == "click")
    this.setCaretPositionFromSelection();
  else
    this.positionCaret(event);
  this.showCaretTimer_ = window.setTimeout(this.showCaret.bind(this), 0);
};

Editor.prototype.positionCaret = function() {
  if (this.cursorOffset_ < 0)
    this.setCaretPositionFromSelection();
  else
    this.setSelectionAndCaretPositionFromOffset();
};

Editor.prototype.setSelectionAndCaretPositionFromOffset = function() {
  var selection = window.getSelection();
  var textNode = this.lines_[this.currentLine_].firstChild;
  if (this.selectionStart_ < 0) {
    selection.setBaseAndExtent(textNode, this.cursorOffset_, textNode, this.cursorOffset_);
    this.setCaretPositionFromSelection();
  } else {
    if (this.selectionStart_ < this.cursorOffset_) {
      selection.setBaseAndExtent(textNode, this.selectionStart_, textNode, this.cursorOffset_);
      this.setCaretPositionFromSelection(RIGHT);
    } else {
      selection.setBaseAndExtent(textNode, this.cursorOffset_, textNode, this.selectionStart_);
      this.setCaretPositionFromSelection(LEFT);
    }
  }
};

Editor.prototype.setCaretPositionFromSelection = function(opt_direction) {
  var direction = opt_direction || RIGHT;
  var selection = window.getSelection();

  // TODO(aboxhall): detect selection outside editor and ignore
  if (!selection.rangeCount) {
    if (this.cursorOffset_ == -1)
      this.cursorOffset_ = this.textLength_;
    this.setSelectionAndCaretPositionFromOffset();
  }

  var range = selection.getRangeAt(0);
  if (!range) {
    console.log("no range");
    return;
  }

  var x, rect;
  if (range.startOffset != range.endOffset || range.startContainer != range.endContainer) {
    // Only selection ranges with non-zero size have a bounding rect
    rect = range.getBoundingClientRect();
    if (!rect) {
      console.log("no rect");
      return;
    }

    if (direction == RIGHT) {
      x = rect.right + window.pageXOffset;
      this.cursorOffset_ = range.endOffset;
      var div = range.endContainer.parentNode;
      this.currentLine_ = this.lines_.indexOf(div);
    } else {
      x = rect.left + window.pageXOffset;
      this.cursorOffset_ = range.startOffset;
      var div = range.startContainer.parentNode;
      this.currentLine_ = this.lines_.indexOf(div);
    }
  } else {
    // create a new selection which is >0 width and get the position from that
    var node = range.startContainer;
    var pos = range.startOffset;
    var left = pos;
    var right = pos;
    var max = node.data.length;
    var newRange = document.createRange();

    while (left > 0 || right < max) {
      if (right < max) {
        right++;
        newRange.setStart(node, pos);
        newRange.setEnd(node, right);
        rect = newRange.getBoundingClientRect();
        if (rect) {
          x = rect.left;
          this.cursorOffset_ = newRange.startOffset;
          var div = range.startContainer.parentNode;
          this.currentLine_ = this.lines_.indexOf(div);
          break;
        }
      }
      if (left > 0) {
        left--;
        newRange.setStart(node, left);
        newRange.setEnd(node, pos);
        rect = newRange.getBoundingClientRect();
        if (rect) {
          x = rect.right;
          this.cursorOffset_ = newRange.endOffset;
          var div = range.endContainer.parentNode;
          this.currentLine_ = this.lines_.indexOf(div);
          break;
        }
      }
    }
  }
  caretX = x;
  caretY = rect.top + window.pageYOffset;
  this.caret_.style.left = caretX + 'px';
  this.caret_.style.top = caretY + 'px';
};

Editor.prototype.showCaret = function() {
  this.cursorActive_ = true;
  this.caret_.style.webkitAnimationName = '';
  this.caret_.style.webkitAnimationName = 'blink';
};

Editor.prototype.hideCaret = function() {
  this.cursorActive_ = false;
  this.caret_.style.left = '-200px';
  this.caret_.style.top = '0px';
  this.caret_.style.webkitAnimationName = '';
};

Editor.prototype.cursor = function(event) {
  event.stopPropagation();

  var modifiers = modifierString(event.ctrlKey, event.altKey, event.shiftKey, event.metaKey);

  if (this.preventDefault_[event.keyCode] && this.preventDefault_[event.keyCode][modifiers]) {
    event.preventDefault();
  }

  // TODO handle selection state portably and robustly
  if (event.keyCode == KeyCodes["left"] || event.keyCode == KeyCodes["right"] || event.keyCode == KeyCodes["home"] || event.keyCode == KeyCodes["end"] ) {
    if (event.shiftKey) {
      if (this.selectionStart_ < 0)
        this.selectionStart_ = this.cursorOffset_;
    } else {
      this.selectionStart_ = -1;
    }
  }

  if (this.action_[event.keyCode] && this.action_[event.keyCode][modifiers]) {
    this.action_[event.keyCode][modifiers]();
    return;
  }
};

Editor.prototype.selectAll = function() {
  document.getSelection().selectAllChildren(this.editor_);
  this.cursorOffset_ = this.textLength_;
  this.setCaretPositionFromSelection(RIGHT);
};

Editor.prototype.moveCursorOneCharacter = function(direction, inSelection) {
  if (direction == LEFT && this.cursorOffset_ != 0) {
    this.cursorOffset_--;
  } else if (direction == RIGHT && this.cursorOffset_ != this.textLength_) {
    this.cursorOffset_++;
  }
  this.setSelectionAndCaretPositionFromOffset();
};

Editor.prototype.moveCursorOneWord = function(direction) {
  this.cursorOffset_ = this.offsetOfNextWordBreak(direction);
  this.setSelectionAndCaretPositionFromOffset();
};

Editor.prototype.moveCursorOneLine = function(direction) {
  this.cursorOffset_ = 0;
};

Editor.prototype.offsetOfNextWordBreak = function(direction) {
  var textContent = this.editor_.textContent;
  if (direction == LEFT) {
    var textToLeftOfCursor = textContent.substring(0, this.cursorOffset_);
    var textToRightOfLastFoundBreak = textToLeftOfCursor;
    var textToLeftOfLastFoundBreak = "";
    while (textToRightOfLastFoundBreak) {
      var charsToNextWordBreak = textToRightOfLastFoundBreak.search(/(\s\b)/);
      if (charsToNextWordBreak != -1) {
        charsToNextWordBreak += 1; // space belongs to the left
        textToLeftOfLastFoundBreak += textToRightOfLastFoundBreak.substring(0, charsToNextWordBreak)
        textToRightOfLastFoundBreak = textToRightOfLastFoundBreak.substring(charsToNextWordBreak);
      } else {
        break;
      }
    }
    return textToLeftOfLastFoundBreak.length;
  } else {
    var textToRightOfCursor = textContent.substring(this.cursorOffset_);
    var charsToNextWordBreak = textToRightOfCursor.search(/\w\b/);
    if (charsToNextWordBreak == -1)
      return this.textLength_;
    else
      return this.cursorOffset_ + charsToNextWordBreak + 1 // no lookbehind :(
  }
};

Editor.prototype.moveCursorToEndOfLine = function(direction) {
  if (direction == LEFT)
     this.cursorOffset_ = 0;
  else
     this.cursorOffset_ = this.textLength_;

  this.setSelectionAndCaretPositionFromOffset();
};

Editor.prototype.deleteRange = function(start, end) {
  if (start == end || end < start)
    return;
  if (start < 0)
    start = 0;
  if (end > this.textLength_)
    end = this.textLength_;

  if (start == 0 && end == this.textLength_) {
    this.textLength_ = 0;
    this.editor_.innerHTML = "&nbsp;";
    this.cursorOffset_ = 0;
  } else {
    this.editor_.firstChild.deleteData(start, end - start);
    this.textLength_ = this.editor_.textContent.length;
  }
};

Editor.prototype.deleteOneWord = function(direction) {
  if (direction == LEFT) {
    var startOffset = this.offsetOfNextWordBreak(LEFT);
    this.deleteRange(startOffset, this.cursorOffset_);
    this.cursorOffset_ = startOffset;
  } else {
    var endOffset = this.offsetOfNextWordBreak(RIGHT);
    this.deleteRange(this.cursorOffset_, endOffset);
  }
  this.setSelectionAndCaretPositionFromOffset();
};

Editor.prototype.deleteToEndOfLine = function(direction) {
  if (direction == LEFT) {
    this.deleteRange(0, this.cursorOffset_);
    this.cursorOffset_ = 0;
  } else {
    this.deleteRange(this.cursorOffset_, this.textLength_);
  }
  this.setSelectionAndCaretPositionFromOffset();
};

Editor.prototype.deleteSelection = function() {
  this.selectionStart_ = -1;
  var selection = document.getSelection();
  var range = selection.getRangeAt(0);
  if (!range || range.collapsed || range.startContainer != this.editor_.firstChild || range.endContainer != this.editor_.firstChild)
    return false;

  var textNode = this.editor_.firstChild;
  if (range.startContainer != textNode || range.endContainer != textNode)
    return false;

  this.deleteRange(range.startOffset, range.endOffset);
  this.cursorOffset_ = range.startOffset;
  this.setSelectionAndCaretPositionFromOffset();
  return true;
};

Editor.prototype.deleteChar = function(direction) {
  console.log("this.cursorOffset_ = " + this.cursorOffset_);
  if (this.textLength_ == 0) {
    console.log("textLength == 0");
    return;
  }

  if (direction == LEFT && this.cursorOffset_ == 0) {
    console.log("direction == LEFT && this.cursorOffset_ == 0");
    return;
  }

  if (direction == RIGHT && this.cursorOffset_ == this.textLength_) {
    console.log("direction == RIGHT && this.cursorOffset_ == textLength");
    return;
  }

  if (direction == LEFT)
    this.cursorOffset_--;

  this.deleteRange(this.cursorOffset_, this.cursorOffset_ + 1);
  this.setSelectionAndCaretPositionFromOffset();
};

Editor.prototype.backspace = function() {
  this.deleteSelection() || this.deleteChar(LEFT);
};

Editor.prototype.del = function() {
  this.deleteSelection() || this.deleteChar(RIGHT);
};

Editor.prototype.type = function(event) {
  if (!event.charCode || event.ctrlKey || event.altKey || event.metaKey)
    return;

  this.deleteSelection();

  if (event.charCode == 32) {
    var char = " ";
    event.preventDefault();
  } else {
    var char = String.fromCharCode(event.charCode);
  }

  var currentText = this.editor_.textContent;
  if (this.textLength_ == 0)
    this.editor_.textContent = char;
  else if (this.cursorOffset_ == this.textLength_)
    this.editor_.textContent = currentText + char;
  else
    this.editor_.textContent = currentText.substring(0, this.cursorOffset_) + char + currentText.substring(this.cursorOffset_, this.textLength_);

  this.textLength_ = this.editor_.textContent.length;
  this.cursorOffset_++;
  this.positionCaret();

  event.stopPropagation();
};
