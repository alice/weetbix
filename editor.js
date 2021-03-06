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


Position = function(offset, line) {
  this.offset = offset != undefined ? offset : -1;
  this.line = line != undefined ? line : -1;
};

Position.prototype.offset;
Position.prototype.line;

Position.prototype.clear = function() {
  this.offset = -1;
  this.line = -1;
};

Position.prototype.equals = function(otherPos) {
  return this.offset == otherPos.offset && this.line == otherPos.line;
};

Position.prototype.isValid = function() {
  return this.offset >= 0 && this.line >= 0;
}

// Whether this position is after the other position
Position.prototype.after = function(otherPos) {
  if (!otherPos || !otherPos.isValid()) {
    console.warn("undefined/null/invalid otherPos:", otherPos);
    console.trace();
    return false;
  }

  if (this.equals(otherPos))
    return false;

  if (this.line > otherPos.line)
    return true;

  return this.offset > otherPos.offset;
};

Position.prototype.before = function(otherPos) {
  if (!otherPos || !otherPos.isValid()) {
    console.warn("undefined/null/invalid otherPos:", otherPos);
    console.trace();
    return false;
  }

  return otherPos.after(this);
};


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

var CursorMovements = {
  "oneCharacter": 0,
  "oneWord": 1,
  "oneLine": 2,
  "toEndOfLine": 3
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
Editor.prototype.selectionStart_ = new Position();
Editor.prototype.minPosition_ = new Position(0, 0);
Editor.prototype.maxPosition_ = new Position();
Editor.prototype.lineHeight_ = "";

// Keep track of the listener functions to add/remove on focus/blur
Editor.prototype.keydownListener_ = 0;
Editor.prototype.keypressListener_ = 0;

Editor.prototype.decorate = function(editor, caret) {
  this.editor_ = editor;

  var lines = editor.textContent.split("\n");
  editor.innerHTML = "";
  for (var i = 0; i < lines.length; i++) {
    var line = document.createElement("div");
    line.className = "line";
    line.textContent = lines[i];
    this.lines_.push(line);
    editor.appendChild(line);
  }

  // determine lineHeight_
  if (editor.textContent == "") {
    var tempLine = document.createElement("div");
    tempLine.innerHTML = "&nbsp;";
    editor.appendChild(tempLine);
    this.lineHeight_ = "" + tempLine.clientHeight + "px";
    editor.removeChild(tempLine);
  } else {
    this.lineHeight_ = "" + this.lines_[0].clientHeight + "px";
  }

  for (var i = 0; i < this.numLines(); i++)
    this.lines_[i].style.height = this.lineHeight_;

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
  this.bindMapping("up", "", this.moveCursor.bind(this, CursorMovements.oneLine, UP));
  this.bindMappingPreventDefault("up", "Shift", this.moveCursor.bind(this, CursorMovements.oneLine, UP, true));
  this.bindMapping("down", "", this.moveCursor.bind(this, CursorMovements.oneLine, DOWN));
  this.bindMappingPreventDefault("down", "Shift", this.moveCursor.bind(this, CursorMovements.oneLine, DOWN, true));

  if (os == OS.MAC) {
    this.bindMappingPreventDefault("backspace", "Alt", this.delete.bind(this, CursorMovements.oneWord, LEFT));
    this.bindMappingPreventDefault("backspace", "Meta", this.delete.bind(this, CursorMovements.toEndOfLine, LEFT));
    this.bindMapping("delete", "Alt", this.delete.bind(this, CursorMovements.oneWord, RIGHT));
    this.bindMappingPreventDefault("delete", "Meta", this.delete.bind(this, CursorMovements.toEndOfLine, RIGHT));
    this.bindMapping("a", "Ctrl", this.moveCursor.bind(this, CursorMovements.toEndOfLine, LEFT));
    this.bindMapping("e", "Ctrl", this.moveCursor.bind(this, CursorMovements.toEndOfLine, RIGHT));
    this.bindMapping("k", "Ctrl", this.delete.bind(this, CursorMovements.toEndOfLine, RIGHT, true));
    this.bindMappingPreventDefault("a", "Meta", this.selectAll.bind(this));
  } else if (os == OS.WIN) {
    this.bindMappingPreventDefault("backspace", "Ctrl", this.delete.bind(this, CursorMovements.oneWord, LEFT));
    this.bindMapping("delete", "Ctrl", this.delete.bind(this, CursorMovements.oneWord, RIGHT));
    this.bindMappingPreventDefault("a", "Ctrl", this.selectAll.bind(this));
    this.bindMappingPreventDefault("home", "Shift", this.moveCursor.bind(this, CursorMovements.toEndOfLine, LEFT));
    this.bindMappingPreventDefault("home", "", this.moveCursor.bind(this, CursorMovements.toEndOfLine, LEFT));
    this.bindMappingPreventDefault("end", "Shift", this.moveCursor.bind(this, CursorMovements.toEndOfLine, RIGHT));
    this.bindMappingPreventDefault("end", "", this.moveCursor.bind(this, CursorMovements.toEndOfLine, RIGHT));
  }

  this.mapLeftRight("left", LEFT);
  this.mapLeftRight("right", RIGHT);
};

Editor.prototype.mapLeftRight = function(key, direction) {
  this.bindMapping(key, "", this.moveCursor.bind(this, CursorMovements.oneCharacter, direction, false));
  this.bindMappingPreventDefault(key, "Shift", this.moveCursor.bind(this, CursorMovements.oneCharacter, direction, true));
  if (os == OS.MAC) {
    this.bindMapping(key, "Ctrl", this.moveCursor.bind(this, CursorMovements.toEndOfLine, direction));
    this.bindMappingPreventDefault(key, "Meta", this.moveCursor.bind(this, CursorMovements.toEndOfLine, direction));
    this.bindMapping(key, "Alt", this.moveCursor.bind(this, CursorMovements.oneWord, direction));
    this.bindMappingPreventDefault(key, "CtrlShift", this.moveCursor.bind(this, CursorMovements.toEndOfLine, direction));
    this.bindMappingPreventDefault(key, "ShiftMeta", this.moveCursor.bind(this, CursorMovements.toEndOfLine, direction));
    this.bindMappingPreventDefault(key, "AltShift", this.moveCursor.bind(this, CursorMovements.oneWord, direction));
  } else if (os == OS.WIN) {
    this.bindMapping(key, "Ctrl", this.moveCursor.bind(this, CursorMovements.oneWord, direction));
    this.bindMappingPreventDefault(key, "CtrlShift", this.moveCursor.bind(this, CursorMovements.oneWord, direction));
  }
};

Editor.prototype.numLines = function() {
  return this.lines_.length;
};

Editor.prototype.maxLineNumber = function() {
  return this.numLines() - 1;
};

Editor.prototype.currentLine = function() {
  return this.lines_[this.currentLine_];
};

Editor.prototype.currentLineLength = function() {
  return this.currentLine().textContent.length;
};

Editor.prototype.cursorPosition = function() {
  return new Position(this.cursorOffset_, this.currentLine_);
}

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
  var currentLine = this.currentLine();
  var currentNode = currentLine.textContent.length ? currentLine.firstChild : currentLine;

  if (!this.selectionStart_.isValid()) {
    selection.setBaseAndExtent(currentNode, this.cursorOffset_, currentNode, this.cursorOffset_);
    this.setCaretPositionFromSelection();
  } else {
    selectionStartLine = this.lineForPosition(this.selectionStart_);
    selectionStartNode = selectionStartLine.textContent.length ? selectionStartLine.firstChild : selectionStartLine;
    if (this.selectionStart_.before(this.cursorPosition())) {
      selection.setBaseAndExtent(selectionStartNode, this.selectionStart_.offset, currentNode, this.cursorOffset_);
      this.setCaretPositionFromSelection(RIGHT);
    } else {
      selection.setBaseAndExtent(currentNode, this.cursorOffset_, selectionStartNode, this.selectionStart_.offset);
      this.setCaretPositionFromSelection(LEFT);
    }
  }
};

Editor.prototype.lineForPosition = function(pos) {
  return this.lines_[pos.line];
};

Editor.prototype.setCurrentLineFromDiv = function(div) {
  if (this.lines_.indexOf(div) < 0) {
    console.log(div);
    console.trace();
  }
  this.currentLine_ = this.lines_.indexOf(div);
}

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

  var x, y, focusNode;
  if (range.startOffset != range.endOffset || range.startContainer != range.endContainer) {
    // Only selection ranges with non-zero size have a bounding rect
    rect = range.getBoundingClientRect();
    if (!rect) {
      return;
    }

    if (direction == RIGHT) {
      x = rect.right;
      this.cursorOffset_ = range.endOffset;
      focusNode = range.endContainer;
    } else {
      x = rect.left;
      this.cursorOffset_ = range.startOffset;
      focusNode = range.startContainer;
    }

    y = rect.top;
  } else {
    // create a new selection which is >0 width and get the position from that
    var emptyNode = false;

    var node = range.startContainer;
    if (node.textContent == "") {
      emptyNode = true;
      node.innerHTML = "&nbsp;";
    }

    var pos = range.startOffset;
    var coords = this.coordinatesForSelectionPos(node, pos);
    x = coords.x;
    y = coords.y;

    this.cursorOffset_ = range.startOffset;
    focusNode = range.startContainer;

    if (emptyNode)
      node.innerHTML = "";
  }

  var div = this.findLineDivForSelection(focusNode);
  this.setCurrentLineFromDiv(div);

  this.caret_.style.left = x + 'px';
  this.caret_.style.top = y + 'px';
  this.showCaret();
};

Editor.prototype.coordinatesForSelectionPos = function(node, pos) {
  var left = pos;
  var right = pos;
  var max = node.textContent.length;

  var x = 0;
  var newRange = document.createRange();

  while (left > 0 || right < max) {
    if (right < max) {
      right++;
      newRange.setStart(node, pos);
      newRange.setEnd(node, right);
      rect = newRange.getBoundingClientRect();
      if (rect)
        return {x: rect.left, y: rect.top};
    }
    if (left > 0) {
      left--;
      newRange.setStart(node, left);
      newRange.setEnd(node, pos);
      rect = newRange.getBoundingClientRect();
      if (rect)
        return {x: rect.right, y: rect.top};
    }
  }

  console.trace();
  return -1;
};

Editor.prototype.findLineDivForSelection = function(div) {
  if (div.className == "line")
    return div;

  if (div.className == "editor") {
    console.trace();
    return div.firstChild;  // FIXME
  }

  return div.parentNode;
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

Editor.prototype.moveCursor = function(movement, direction, inSelection) {
  if (inSelection) {
    if (!this.selectionStart_.isValid()) {
      this.selectionStart_.offset = this.cursorOffset_;
      this.selectionStart_.line = this.currentLine_;
    }
  } else {
    if (!this.selectionStart_)
      console.trace();
    this.selectionStart_.clear();
  }

  switch (movement) {
  case CursorMovements.oneCharacter:
    this.moveCursorOneCharacter(direction);
    break;
  case CursorMovements.oneWord:
    this.moveCursorOneWord(direction);
    break;
  case CursorMovements.oneLine:
    this.moveCursorOneLine(direction);
    break;
  case CursorMovements.toEndOfLine:
    this.moveCursorToEndOfLine(direction);
    break;
  default:
    console.log("movement:", movement, "direction:", direction, "inSelection:", inSelection);
    console.trace();
    break;
  }
};

Editor.prototype.moveCursorOneCharacter = function(direction) {
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

Editor.prototype.delete = function(movement, direction, deleteEmptyLine) {
  switch (movement) {
  case CursorMovements.oneCharacter:
    this.deleteChar(direction);
    break;
  case CursorMovements.oneWord:
    this.deleteOneWord(direction);
    break;
  case CursorMovements.toEndOfLine:
    this.deleteToEndOfLine(direction, deleteEmptyLine);
    break;
  default:
    console.trace();
    break;
  }
}

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

Editor.prototype.deleteToEndOfLine = function(direction, removeEmptyLine) {
  removeEmptyLine = removeEmptyLine || false;
  if (removeEmptyLine && !this.currentLine().textContent.length) {
    if (this.currentLine_ < this.maxLineNumber())
      this.deleteNewline(RIGHT);
    else
      this.deleteNewline(LEFT);
    return;
  }

  if (direction == LEFT) {
    this.deleteRange(0, this.cursorOffset_);
    this.cursorOffset_ = 0;
  } else {
    this.deleteRange(this.cursorOffset_, this.currentLineLength());
  }
  this.setSelectionAndCaretPositionFromOffset();
};

Editor.prototype.deleteSelection = function() {
  this.selectionStart_.clear();
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

Editor.prototype.deleteNewline = function(direction) {
  if (direction == LEFT) {
    if (this.currentLine_ == 0)
        return;

    this.currentLine_--;
    this.cursorOffset_ = this.currentLineLength();
    this.joinLineAfter(this.currentLine_);
    this.setSelectionAndCaretPositionFromOffset();
    return
  }

  if (this.currentLine_ == this.maxLineNumber())
    return;

  this.joinLineAfter(this.currentLine_);
  this.setSelectionAndCaretPositionFromOffset();
}

Editor.prototype.deleteChar = function(direction) {
  if (this.editor_.textContent.length == 0)
    return;

  if (direction == LEFT && this.cursorOffset_ == 0) {
    this.deleteNewline(LEFT);
    return;
  }

  if (direction == RIGHT && this.cursorOffset_ == this.currentLineLength()) {
    this.deleteNewline(RIGHT);
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
  newLine.className = "line";

  var currentLine = this.currentLine();
  var currentLineContent = currentLine.textContent;
  currentLine.textContent = currentLineContent.substring(0, this.cursorOffset_);
  newLine.textContent = currentLineContent.substring(this.cursorOffset_);
  newLine.style.height = this.lineHeight_;
  if (newLine.textContent == "")
    newLine.appendChild(document.createElement("span"));
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
  this.calculateMaxPosition();

  event.stopPropagation();
};

Editor.prototype.calculateMaxPosition = function() {
  var maxLineNumber = this.maxLineNumber();
  var lastLine = this.lines_[maxLineNumber];
  var lastLineLength = lastLine.textContent.length;

  this.maxPosition_.line = maxLineNumber;
  this.maxPosition_.offset = lastLineLength;
};
