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

if (!window.getSelection().__proto__.setBaseAndExtent) {
  Selection.prototype.setBaseAndExtent = function(baseNode, baseOffset, extentNode, extentOffset) {
    var range = document.createRange();
    range.setStart(baseNode, baseOffset);
    range.setEnd(extentNode, extentOffset);
    this.removeAllRanges();
    this.addRange(range);
  }
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
Editor.prototype.lineHeight = 0;

// Keep track of the listener functions to add/remove on focus/blur
Editor.prototype.keydownListener_ = 0;
Editor.prototype.keypressListener_ = 0;

Editor.prototype.decorate = function(editor, caret) {
  this.editor_ = editor;

  // determine lineHeight
  if (editor.textContent == "") {
    editor.innerHTML = "&nbsp;"
    this.lineHeight = editor.clientHeight;
    editor.textContent = "";
  } else {
    this.lineHeight = editor.clientHeight;
  }

  var lines = editor.textContent.split("\n");
  editor.innerHTML = "";
  for (var i = 0; i < lines.length; i++) {
    var line = document.createElement("div");
    line.textContent = lines[i];
    this.lines_.push(line);
    editor.appendChild(line);
  }

  this.caret_ = caret;  // NOTE(aboxhall): create caret element?

  // If focus comes from a click, give the click event a chance to set the
  // selection before setting the cursor position
  editor.addEventListener("focus", function (event) {
    // Only listen for keystrokes when focused.
    this.keydownListener_ = this.cursor.bind(this);
    this.keypressListener_ = this.type.bind(this);
    this.editor_.onkeydown = this.keydownListener_;
    this.editor_.onkeypress = this.keypressListener_;

    this.showCaretTimer_ = setTimeout(this.positionAndShowCaret.bind(this, event), 0);
  }.bind(this));
  editor.addEventListener("click", function (event) {
    this.showCaretTimer_ = setTimeout(this.positionAndShowCaret.bind(this, event), 0);
  }.bind(this));

  editor.addEventListener("blur", function () {
    this.editor_.onkeypress = undefined;
    this.editor_.onkeydown = undefined;
    this.keydownListener_ = undefined;
    this.keypressListener_ = undefined;
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
  if (this.editor_.getAttribute("aria-multiline"))
    this.bindMappingPreventDefault("return", "", this.insertNewlineAtCursor.bind(this, true));
  else
    this.bindMapping("return", "", this.editor_.blur.bind(this.editor_));
  this.bindMapping("tab", "", this.editor_.blur.bind(this.editor_));
  this.bindMapping("up", "", this.moveCursorOneLine.bind(this, UP));
  this.bindMapping("down", "", this.moveCursorOneLine.bind(this, DOWN));


  if (os == OS.MAC) {
    this.bindMappingPreventDefault("backspace", "Alt", this.deleteOneWord.bind(this, LEFT));
    this.bindMappingPreventDefault("backspace", "Meta", this.deleteToEndOfLine.bind(this, LEFT));
    this.bindMapping("delete", "Alt", this.deleteOneWord.bind(this, RIGHT));
    this.bindMappingPreventDefault("delete", "Meta", this.deleteToEndOfLine.bind(this, RIGHT));
    this.bindMapping("a", "Ctrl", this.moveCursorToEndOfLine.bind(this, LEFT));
    this.bindMapping("e", "Ctrl", this.moveCursorToEndOfLine.bind(this, RIGHT));
    this.bindMapping("k", "Ctrl", this.deleteToEndOfLine.bind(this, RIGHT));
    this.bindMappingPreventDefault("a", "Meta", this.selectAll.bind(this));
  } else if (os == OS.WIN) {
    this.bindMappingPreventDefault("backspace", "Ctrl", this.deleteOneWord.bind(this, LEFT));
    this.bindMapping("delete", "Ctrl", this.deleteOneWord.bind(this, RIGHT));
    this.bindMappingPreventDefault("a", "Ctrl", this.selectAll.bind(this));
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

Editor.prototype.numLines = function() {
  return this.lines_.length;
};

Editor.prototype.maxLineNumber = function() {
  return this.numLines() - 1;
}

Editor.prototype.currentLine = function() {
  return this.lines_[this.currentLine_];
};

Editor.prototype.currentLineLength = function() {
  return this.currentLine().textContent.length;
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
  var textNode = this.currentLine().firstChild;

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
  var direction = opt_direction != undefined ? opt_direction : RIGHT;
  var selection = window.getSelection();

  // TODO(aboxhall): detect selection outside editor and ignore
  if (!selection.rangeCount) {
    if (this.cursorOffset_ == -1) {
      this.currentLine_ = this.numLines();
      this.cursorOffset_ = this.currentLineLength();
    }
    this.setSelectionAndCaretPositionFromOffset();
  }

  var range = selection.getRangeAt(0);
  if (!range) {
    return;
  }

  var x, rect;
  if (range.startOffset != range.endOffset || range.startContainer != range.endContainer) {
    // Only selection ranges with non-zero size have a bounding rect
    rect = range.getBoundingClientRect();
    if (!rect) {
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
  var caretX = x;
  var caretY = rect.top + window.pageYOffset;
  this.caret_.style.left = caretX + 'px';
  this.caret_.style.top = caretY + 'px';
  this.showCaret();
};

Editor.prototype.showCaret = function() {
  this.cursorActive_ = true;
  this.caret_.style.webkitAnimationName = 'none';
  window.getComputedStyle(this.caret_).left;  // force style recalculation :C
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
    event.stopPropagation();
    return;
  }
};

Editor.prototype.selectAll = function() {
  document.getSelection().selectAllChildren(this.editor_);
  this.currentLine_ = this.numLines();
  this.cursorOffset_ = this.currentLineLength();
  this.setCaretPositionFromSelection(RIGHT);
};

Editor.prototype.moveCursorOneCharacter = function(direction, inSelection) {
  if (direction == LEFT) {
    if (this.cursorOffset_ > 0) {
      this.cursorOffset_--;
    } else if (this.currentLine_ > 0) {
      this.currentLine_--;
      this.cursorOffset_ = this.currentLineLength();
    }
  } else {
    if (this.cursorOffset_ < this.currentLineLength()) {
      this.cursorOffset_++;
    } else if (this.currentLine_ < this.maxLineNumber()) {
      this.currentLine_++;
      this.cursorOffset_ = 0;
    }
  }
  this.setSelectionAndCaretPositionFromOffset();
};

Editor.prototype.moveCursorOneWord = function(direction) {
  var nextWordBreak = this.positionOfNextWordBreak(direction);
  this.currentLine_ = nextWordBreak.lineNumber;
  this.cursorOffset_ = nextWordBreak.cursorOffset;
  this.setSelectionAndCaretPositionFromOffset();
};

Editor.prototype.moveCursorOneLine = function(direction) {
  if (direction == UP && this.currentLine_ == 0 || direction == DOWN && this.currentLine_ == this.maxLineNumber())
    return;

  if (direction == UP)
    this.currentLine_--;
  else
    this.currentLine_++;

  this.cursorOffset_ = Math.min(this.cursorOffset_, this.currentLineLength());

  this.setSelectionAndCaretPositionFromOffset();
};

Editor.prototype.positionOfNextWordBreak = function(direction) {
  var cursorOffset = this.cursorOffset_;
  var lineNumber = this.currentLine_;

  if (direction == LEFT) {
    while(lineNumber >= 0) {
      var cursorOffsetForLine = this.findPreviousWordBreak(lineNumber, cursorOffset);
      if (cursorOffsetForLine != -1) {
        cursorOffset = cursorOffsetForLine;
        break;
      } else if (lineNumber == 0) {
        cursorOffset = 0;
        break;
      }

      lineNumber--;
      cursorOffset = this.lines_[lineNumber].textContent.length;
    }
  } else {
    while(lineNumber <= this.maxLineNumber()) {
      var cursorOffsetForLine = this.findNextWordBreak(lineNumber, cursorOffset);
      if (cursorOffsetForLine != -1) {
        cursorOffset = cursorOffsetForLine;
        break;
      } else if (lineNumber == this.maxLineNumber()) {
        cursorOffset = this.lines_[lineNumber].textContent.length;
        break;
      }
    
      lineNumber++;
      cursorOffset = 0;
    }
  }
  var result = {cursorOffset: cursorOffset, lineNumber: lineNumber};
  return result;
};

Editor.prototype.findPreviousWordBreak = function(lineNumber, cursorOffset) {
  var textContent = this.lines_[lineNumber].textContent;

  var textToLeftOfCursor = textContent.substring(0, cursorOffset);
  var textToRightOfLastFoundBreak = textToLeftOfCursor;
  var offsetOfLastFoundBreak = null;
  var textToLeftOfLastFoundBreak = "";
  while (textToRightOfLastFoundBreak) {
    var charsToNextWordBreak = textToRightOfLastFoundBreak.search(/.\b\w/);
    if (charsToNextWordBreak != -1) {
      charsToNextWordBreak += 1; // consume character before word break
      textToLeftOfLastFoundBreak += textToRightOfLastFoundBreak.substring(0, charsToNextWordBreak);
      offsetOfLastFoundBreak += charsToNextWordBreak;
      textToRightOfLastFoundBreak = textToRightOfLastFoundBreak.substring(charsToNextWordBreak);
    } else if (offsetOfLastFoundBreak == null && textToRightOfLastFoundBreak.search(/\b\w/) == 0) {
      // Only word break is at the start of the line
      offsetOfLastFoundBreak = 0;
      break;
    } else {
      break;
    }
  }
  return (offsetOfLastFoundBreak !== null ? offsetOfLastFoundBreak : -1);
}

Editor.prototype.findNextWordBreak = function(lineNumber, cursorOffset) {
  var textContent = this.lines_[lineNumber].textContent;
  var textToRightOfCursor = textContent.substring(cursorOffset);
  var charsToNextWordBreak = textToRightOfCursor.search(/\w\b/);
  if (charsToNextWordBreak == -1)
    return -1;
  else
    return cursorOffset + charsToNextWordBreak + 1 // no lookbehind :(
}

Editor.prototype.moveCursorToEndOfLine = function(direction) {
  if (direction == LEFT){
    this.cursorOffset_ = 0;
  } else {
    this.cursorOffset_ = this.currentLineLength();
  }
  this.setSelectionAndCaretPositionFromOffset();
};

Editor.prototype.deleteRange = function(start, end) {
  // FIXME(aboxhall)
  if (start == end || end < start)
    return;
  if (start < 0)
    start = 0;
  if (end > this.currentLineLength())
    end = this.currentLineLength();

  if (start == 0 && end == this.currentLineLength()) {
    // FIXME(aboxhall)
    this.currentLine().innerHTML = "&nbsp;";
    this.cursorOffset_ = 0;
    this.currentLine().firstChild.deleteData(start, end - start);
  } else {
    this.currentLine().firstChild.deleteData(start, end - start);
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
    this.deleteRange(this.cursorOffset_, this.currentLineLength());
  }
  this.setSelectionAndCaretPositionFromOffset();
};

Editor.prototype.deleteSelection = function() {
  this.selectionStart_ = -1;
  var selection = document.getSelection();
  var range = selection.getRangeAt(0);
  if (!range || range.collapsed) {
    return false;
  }

  var textNode = this.currentLine().firstChild;
  if (!this.editor_.contains(range.startContainer) || !this.editor_.contains(range.endContainer)) {
    return false;
  }

  this.deleteRange(range.startOffset, range.endOffset);
  this.cursorOffset_ = range.startOffset;
  this.setSelectionAndCaretPositionFromOffset();
  return true;
};

Editor.prototype.deleteChar = function(direction) {
  if (this.editor_.textContent.length == 0)
    return;

  if (direction == LEFT && this.cursorOffset_ == 0) {
    if (this.currentLine_ == 0)
      return;

    this.currentLine_--;
    this.cursorOffset_ = this.currentLineLength();
    this.joinLineAfter(this.currentLine_);
    this.setSelectionAndCaretPositionFromOffset();
    return;
  }

  if (direction == RIGHT && this.cursorOffset_ == this.currentLineLength()) {
    if (this.currentLine_ == this.maxLineNumber())
      return;

    this.joinLineAfter(this.currentLine_);
    this.setSelectionAndCaretPositionFromOffset();
    return;
  }

  if (direction == LEFT)
    this.cursorOffset_--;

  this.deleteRange(this.cursorOffset_, this.cursorOffset_ + 1);
  this.setSelectionAndCaretPositionFromOffset();
};

Editor.prototype.joinLineAfter = function(lineNumber) {
  var line = this.lines_[lineNumber];
  var nextLineNumber = lineNumber + 1;
  var nextLine = this.lines_[nextLineNumber];
  line.textContent = line.textContent.concat(nextLine.textContent);
  var removedLine = this.lines_.splice(nextLineNumber, 1)[0];
  this.editor_.removeChild(removedLine);
};

Editor.prototype.insertNewlineAtCursor = function(moveCursorToStartOfNewLine) {
  var newLine = document.createElement("div");
  var currentLine = this.currentLine();
  var currentLineContent = currentLine.textContent;
  currentLine.textContent = currentLineContent.substring(0, this.cursorOffset_);
  newLine.textContent = currentLineContent.substring(this.cursorOffset_);
  newLine.clientHeight = this.lineHeight;
  if (newLine.textContent == "")
    newLine.textContent = "asfskdfjh";
  if (this.currentLine_ == this.numLines())
    this.editor.appendChild(newLine);
  else
    this.editor_.insertBefore(newLine, this.lines_[this.currentLine_ + 1]);

  this.lines_.splice(this.currentLine_ + 1, 0, newLine);

  if (moveCursorToStartOfNewLine) {
    this.currentLine_++;
    this.cursorOffset_ = 0;
  }

  this.setSelectionAndCaretPositionFromOffset();
}

Editor.prototype.backspace = function() {
  this.deleteSelection() || this.deleteChar(LEFT);
};

Editor.prototype.del = function() {
  this.deleteSelection() || this.deleteChar(RIGHT);
};

Editor.prototype.type = function(event) {
  if (!event.charCode || event.ctrlKey || event.altKey || event.metaKey || event.keyCode == 13)
    return;

  this.deleteSelection();

  if (event.charCode == 32) {
    var char = " ";
    event.preventDefault();
  } else {
    var char = String.fromCharCode(event.charCode);
  }

  var currentText = this.currentLine().textContent;
  if (currentText.length == 0)
    this.currentLine().textContent = char;
  else if (this.cursorOffset_ == this.textLength_)
    this.currentLine().textContent = currentText + char;
  else
    this.currentLine().textContent = currentText.substring(0, this.cursorOffset_) + char + currentText.substring(this.cursorOffset_, this.textLength_);

  this.cursorOffset_++;
  this.positionCaret();

  event.stopPropagation();
};
