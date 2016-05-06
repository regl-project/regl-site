(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
const regl = require('../regl')()
const mat4 = require('gl-mat4')
const bunny = require('bunny')
const normals = require('angle-normals')

const setupEnvMap = regl({
  frag: `
  precision mediump float;
  uniform sampler2D envmap;
  varying vec3 reflectDir;

  #define PI ${Math.PI}

  vec4 lookupEnv (vec3 dir) {
    float lat = atan(dir.z, dir.x);
    float lon = acos(dir.y / length(dir));
    return texture2D(envmap, vec2(
      0.5 + lat / (2.0 * PI),
      lon / PI));
  }

  void main () {
    gl_FragColor = lookupEnv(reflectDir);
  }`,

  vert: `
  precision mediump float;
  varying vec3 reflectDir;
  void main() { gl_Position = vec4(0,0,0,0); }
  `,

  uniforms: {
    envmap: regl.texture('assets/ogd-oregon-360.jpg'),

    view: regl.prop('view'),

    projection: (args, batchId, {width, heigth}) =>
      mat4.perspective([],
        Math.PI / 4,
        regl.stats.width / regl.stats.height,
        0.01,
        1000),

    invView: ({view}) => mat4.invert([], view)
  }
})

const drawBackground = regl({
  vert: `
  precision mediump float;
  attribute vec2 position;
  uniform mat4 view;
  varying vec3 reflectDir;
  void main() {
    reflectDir = (view * vec4(position, 1, 0)).xyz;
    gl_Position = vec4(position, 0, 1);
  }`,

  attributes: {
    position: regl.buffer([
      -4, -4,
      -4, 4,
      8, 0])
  },

  depth: {
    mask: false,
    enable: false
  },

  count: 3
})

const drawBunny = regl({
  vert: `
  precision mediump float;
  attribute vec3 position, normal;
  uniform mat4 projection, view, invView;
  varying vec3 reflectDir;
  void main() {
    vec4 eye = invView * vec4(0, 0, 0, 1);
    reflectDir = reflect(
      normalize(position.xyz - eye.xyz / eye.w),
      normal);
    gl_Position = projection * view * vec4(position, 1);
  }`,

  attributes: {
    position: regl.buffer(bunny.positions),
    normal: regl.buffer(normals(bunny.cells, bunny.positions))
  },

  elements: regl.elements(bunny.cells)
})

regl.frame(() => {
  const t = 0.01 * regl.stats.count

  setupEnvMap({
    view: mat4.lookAt([],
      [30 * Math.cos(t), 2.5, 30 * Math.sin(t)],
      [0, 2.5, 0],
      [0, 1, 0])
  }, () => {
    drawBackground()
    drawBunny()
  })
})

},{"../regl":59,"angle-normals":33,"bunny":34,"gl-mat4":44}],2:[function(require,module,exports){
var glTypes = require('./constants/dtypes.json')
var extend = require('./extend')

var GL_FLOAT = 5126

function AttributeRecord () {
  this.pointer = false

  this.x = 0.0
  this.y = 0.0
  this.z = 0.0
  this.w = 0.0

  this.buffer = null
  this.size = 0
  this.normalized = false
  this.type = GL_FLOAT
  this.offset = 0
  this.stride = 0
  this.divisor = 0
}

extend(AttributeRecord.prototype, {
  equals: function (other, size) {
    if (!this.pointer) {
      return !other.pointer &&
        this.x === other.x &&
        this.y === other.y &&
        this.z === other.z &&
        this.w === other.w
    } else {
      return other.pointer &&
        this.buffer === other.buffer &&
        this.size === size &&
        this.normalized === other.normalized &&
        this.type === other.type &&
        this.offset === other.offset &&
        this.stride === other.stride &&
        this.divisor === other.divisor
    }
  },

  set: function (other, size) {
    var pointer = this.pointer = other.pointer
    if (pointer) {
      this.buffer = other.buffer
      this.size = size
      this.normalized = other.normalized
      this.type = other.type
      this.offset = other.offset
      this.stride = other.stride
      this.divisor = other.divisor
    } else {
      this.x = other.x
      this.y = other.y
      this.z = other.z
      this.w = other.w
    }
  }
})

module.exports = function wrapAttributeState (
  gl,
  extensions,
  limits,
  bufferState,
  stringStore) {

  var attributeState = {}

  var NUM_ATTRIBUTES = limits.maxAttributes
  var attributeBindings = new Array(NUM_ATTRIBUTES)
  for (var i = 0; i < NUM_ATTRIBUTES; ++i) {
    attributeBindings[i] = new AttributeRecord()
  }

  function AttributeStack () {
    var records = new Array(16)
    for (var i = 0; i < 16; ++i) {
      records[i] = new AttributeRecord()
    }
    this.records = records
    this.top = 0
  }

  function pushAttributeStack (stack) {
    var records = stack.records
    var top = stack.top

    while (records.length - 1 <= top) {
      records.push(new AttributeRecord())
    }

    return records[++stack.top]
  }

  extend(AttributeStack.prototype, {
    pushVec: function (x, y, z, w) {
      var head = pushAttributeStack(this)
      head.pointer = false
      head.x = x
      head.y = y
      head.z = z
      head.w = w
    },

    pushPtr: function (
      buffer,
      size,
      offset,
      stride,
      divisor,
      normalized,
      type) {
      var head = pushAttributeStack(this)
      head.pointer = true
      head.buffer = buffer
      head.size = size
      head.offset = offset
      head.stride = stride
      head.divisor = divisor
      head.normalized = normalized
      head.type = type
    },

    pushDyn: function (data) {
      if (typeof data === 'number') {
        this.pushVec(data, 0, 0, 0)
      } else if (Array.isArray(data)) {
        this.pushVec(data[0], data[1], data[2], data[3])
      } else {
        var buffer = bufferState.getBuffer(data)
        var size = 0
        var stride = 0
        var offset = 0
        var divisor = 0
        var normalized = false
        var type = GL_FLOAT
        if (!buffer) {
          buffer = bufferState.getBuffer(data.buffer)
          size = data.size || 0
          stride = data.stride || 0
          offset = data.offset || 0
          divisor = data.divisor || 0
          normalized = data.normalized || false
          type = buffer.dtype
          if ('type' in data) {
            type = glTypes[data.type]
          }
        } else {
          type = buffer.dtype
        }
        this.pushPtr(buffer, size, offset, stride, divisor, normalized, type)
      }
    },

    pop: function () {
      this.top -= 1
    }
  })

  // ===================================================
  // BIND AN ATTRIBUTE
  // ===================================================
  function bindAttribute (index, current, next, size) {
    size = next.size || size
    if (current.equals(next, size)) {
      return
    }
    if (!next.pointer) {
      if (current.pointer) {
        gl.disableVertexAttribArray(index)
      }
      gl.vertexAttrib4f(index, next.x, next.y, next.z, next.w)
    } else {
      if (!current.pointer) {
        gl.enableVertexAttribArray(index)
      }
      if (current.buffer !== next.buffer) {
        next.buffer.bind()
      }
      gl.vertexAttribPointer(
        index,
        size,
        next.type,
        next.normalized,
        next.stride,
        next.offset)
      var extInstancing = extensions.angle_instanced_arrays
      if (extInstancing) {
        extInstancing.vertexAttribDivisorANGLE(index, next.divisor)
      }
    }
    current.set(next, size)
  }

  // ===================================================
  // DEFINE A NEW ATTRIBUTE
  // ===================================================
  function defAttribute (name) {
    var id = stringStore.id(name)
    var result = attributeState[id]
    if (!result) {
      result = attributeState[id] = new AttributeStack()
    }
    return result
  }

  return {
    bindings: attributeBindings,
    bind: bindAttribute,
    def: defAttribute
  }
}

},{"./constants/dtypes.json":8,"./extend":14}],3:[function(require,module,exports){
// Array and element buffer creation

var isTypedArray = require('./is-typed-array')
var isNDArrayLike = require('./is-ndarray')
var arrayTypes = require('./constants/arraytypes.json')
var bufferTypes = require('./constants/dtypes.json')
var values = require('./values')

var GL_STATIC_DRAW = 35044

var GL_BYTE = 5120
var GL_UNSIGNED_BYTE = 5121
var GL_SHORT = 5122
var GL_UNSIGNED_SHORT = 5123
var GL_INT = 5124
var GL_UNSIGNED_INT = 5125
var GL_FLOAT = 5126

var usageTypes = {
  'static': 35044,
  'dynamic': 35048,
  'stream': 35040
}

function typedArrayCode (data) {
  return arrayTypes[Object.prototype.toString.call(data)] | 0
}

function makeTypedArray (dtype, args) {
  switch (dtype) {
    case GL_UNSIGNED_BYTE:
      return new Uint8Array(args)
    case GL_UNSIGNED_SHORT:
      return new Uint16Array(args)
    case GL_UNSIGNED_INT:
      return new Uint32Array(args)
    case GL_BYTE:
      return new Int8Array(args)
    case GL_SHORT:
      return new Int16Array(args)
    case GL_INT:
      return new Int32Array(args)
    case GL_FLOAT:
      return new Float32Array(args)
    default:
      return null
  }
}

function flatten (result, data, dimension) {
  var ptr = 0
  for (var i = 0; i < data.length; ++i) {
    var v = data[i]
    for (var j = 0; j < dimension; ++j) {
      result[ptr++] = v[j]
    }
  }
}

function transpose (result, data, shapeX, shapeY, strideX, strideY, offset) {
  var ptr = 0
  for (var i = 0; i < shapeX; ++i) {
    for (var j = 0; j < shapeY; ++j) {
      result[ptr++] = data[strideX * i + strideY * j + offset]
    }
  }
  return result
}

module.exports = function wrapBufferState (gl) {
  var bufferCount = 0
  var bufferSet = {}

  function REGLBuffer (buffer, type) {
    this.id = bufferCount++
    this.buffer = buffer
    this.type = type
    this.usage = GL_STATIC_DRAW
    this.byteLength = 0
    this.dimension = 1
    this.data = null
    this.dtype = GL_UNSIGNED_BYTE
  }

  REGLBuffer.prototype.bind = function () {
    gl.bindBuffer(this.type, this.buffer)
  }

  function refresh (buffer) {
    if (!gl.isBuffer(buffer.buffer)) {
      buffer.buffer = gl.createBuffer()
    }
    buffer.bind()
    gl.bufferData(buffer.type, buffer.data || buffer.byteLength, buffer.usage)
  }

  function destroy (buffer) {
    var handle = buffer.buffer
    
    if (gl.isBuffer(handle)) {
      gl.deleteBuffer(handle)
    }
    buffer.buffer = null
    delete bufferSet[buffer.id]
  }

  function createBuffer (options, type, deferInit) {
    var handle = gl.createBuffer()

    var buffer = new REGLBuffer(handle, type)
    bufferSet[buffer.id] = buffer

    function reglBuffer (input) {
      var options = input || {}
      if (Array.isArray(options) ||
          isTypedArray(options) ||
          isNDArrayLike(options)) {
        options = {
          data: options
        }
      } else if (typeof options === 'number') {
        options = {
          length: options | 0
        }
      } else if (options === null || options === void 0) {
        options = {}
      }

      

      if ('usage' in options) {
        var usage = options.usage
        
        buffer.usage = usageTypes[options.usage]
      } else {
        buffer.usage = GL_STATIC_DRAW
      }

      var dtype = 0
      if ('type' in options) {
        
        dtype = bufferTypes[options.type]
      }

      var dimension = (options.dimension | 0) || 1
      var byteLength = 0
      var data = null
      if ('data' in options) {
        data = options.data
        if (data === null) {
          byteLength = options.length | 0
        } else {
          if (isNDArrayLike(data)) {
            var shape = data.shape
            var stride = data.stride
            var offset = data.offset

            var shapeX = 0
            var shapeY = 0
            var strideX = 0
            var strideY = 0
            if (shape.length === 1) {
              shapeX = shape[0]
              shapeY = 1
              strideX = stride[0]
              strideY = 0
            } else if (shape.length === 2) {
              shapeX = shape[0]
              shapeY = shape[1]
              strideX = stride[0]
              strideY = stride[1]
            } else {
              
            }

            dtype = dtype || typedArrayCode(data) || GL_FLOAT
            dimension = shapeY
            data = transpose(
              makeTypedArray(dtype, shapeX * shapeY),
              data.data,
              shapeX, shapeY,
              strideX, strideY,
              offset)
          } else if (Array.isArray(data)) {
            if (data.length > 0 && Array.isArray(data[0])) {
              dimension = data[0].length
              dtype = dtype || GL_FLOAT
              var result = makeTypedArray(dtype, data.length * dimension)
              data = flatten(result, data, dimension)
              data = result
            } else {
              dtype = dtype || GL_FLOAT
              data = makeTypedArray(dtype, data)
            }
          } else {
            
            dtype = dtype || typedArrayCode(data)
          }
          byteLength = data.byteLength
        }
      } else if ('length' in options) {
        byteLength = options.length | 0
        
      }

      buffer.data = data
      buffer.dtype = dtype || GL_UNSIGNED_BYTE
      buffer.byteLength = byteLength
      buffer.dimension = dimension

      refresh(buffer)

      return reglBuffer
    }

    if (!deferInit) {
      reglBuffer(options)
    }

    reglBuffer._reglType = 'buffer'
    reglBuffer._buffer = buffer
    reglBuffer.destroy = function () { destroy(buffer) }

    return reglBuffer
  }

  return {
    create: createBuffer,

    clear: function () {
      values(bufferSet).forEach(destroy)
    },

    refresh: function () {
      values(bufferSet).forEach(refresh)
    },

    getBuffer: function (wrapper) {
      if (wrapper && wrapper._buffer instanceof REGLBuffer) {
        return wrapper._buffer
      }
      return null
    }
  }
}

},{"./constants/arraytypes.json":7,"./constants/dtypes.json":8,"./is-ndarray":17,"./is-typed-array":18,"./values":32}],4:[function(require,module,exports){
/* globals performance */
module.exports =
  (typeof performance !== 'undefined' && performance.now)
  ? function () { return performance.now() }
  : function () { return +(new Date()) }

},{}],5:[function(require,module,exports){
var extend = require('./extend')

function slice (x) {
  return Array.prototype.slice.call(x)
}

module.exports = function createEnvironment () {
  // Unique variable id counter
  var varCounter = 0

  // Linked values are passed from this scope into the generated code block
  // Calling link() passes a value into the generated scope and returns
  // the variable name which it is bound to
  var linkedNames = []
  var linkedValues = []
  function link (value) {
    var name = 'g' + (varCounter++)
    linkedNames.push(name)
    linkedValues.push(value)
    return name
  }

  // create a code block
  function block () {
    var code = []
    function push () {
      code.push.apply(code, slice(arguments))
    }

    var vars = []
    function def () {
      var name = 'v' + (varCounter++)
      vars.push(name)

      if (arguments.length > 0) {
        code.push(name, '=')
        code.push.apply(code, slice(arguments))
        code.push(';')
      }

      return name
    }

    return extend(push, {
      def: def,
      toString: function () {
        return [
          (vars.length > 0 ? 'var ' + vars + ';' : ''),
          code.join('')
        ].join('')
      }
    })
  }

  // procedure list
  var procedures = {}
  function proc (name) {
    var args = []
    function arg () {
      var name = 'a' + (varCounter++)
      args.push(name)
      return name
    }

    var body = block()
    var bodyToString = body.toString

    var result = procedures[name] = extend(body, {
      arg: arg,
      toString: function () {
        return [
          'function(', args.join(), '){',
          bodyToString(),
          '}'
        ].join('')
      }
    })

    return result
  }

  function compile () {
    var code = ['"use strict";return {']
    Object.keys(procedures).forEach(function (name) {
      code.push('"', name, '":', procedures[name].toString(), ',')
    })
    code.push('}')
    var proc = Function.apply(null, linkedNames.concat([code.join('')]))
    return proc.apply(null, linkedValues)
  }

  return {
    link: link,
    block: block,
    proc: proc,
    compile: compile
  }
}

},{"./extend":14}],6:[function(require,module,exports){

var createEnvironment = require('./codegen')

var primTypes = require('./constants/primitives.json')
var glTypes = require('./constants/dtypes.json')

var GL_ELEMENT_ARRAY_BUFFER = 34963

var GL_FLOAT = 5126
var GL_FLOAT_VEC2 = 35664
var GL_FLOAT_VEC3 = 35665
var GL_FLOAT_VEC4 = 35666
var GL_INT = 5124
var GL_INT_VEC2 = 35667
var GL_INT_VEC3 = 35668
var GL_INT_VEC4 = 35669
var GL_BOOL = 35670
var GL_BOOL_VEC2 = 35671
var GL_BOOL_VEC3 = 35672
var GL_BOOL_VEC4 = 35673
var GL_FLOAT_MAT2 = 35674
var GL_FLOAT_MAT3 = 35675
var GL_FLOAT_MAT4 = 35676
var GL_SAMPLER_2D = 35678
var GL_SAMPLER_CUBE = 35680

var GL_TRIANGLES = 4

var GL_CULL_FACE = 0x0B44
var GL_BLEND = 0x0BE2
var GL_DITHER = 0x0BD0
var GL_STENCIL_TEST = 0x0B90
var GL_DEPTH_TEST = 0x0B71
var GL_SCISSOR_TEST = 0x0C11
var GL_POLYGON_OFFSET_FILL = 0x8037
var GL_SAMPLE_ALPHA_TO_COVERAGE = 0x809E
var GL_SAMPLE_COVERAGE = 0x80A0

var GL_FRONT = 1028
var GL_BACK = 1029

var GL_CW = 0x0900
var GL_CCW = 0x0901

var GL_MIN_EXT = 0x8007
var GL_MAX_EXT = 0x8008

var blendFuncs = {
  '0': 0,
  '1': 1,
  'zero': 0,
  'one': 1,
  'src color': 768,
  'one minus src color': 769,
  'src alpha': 770,
  'one minus src alpha': 771,
  'dst color': 774,
  'one minus dst color': 775,
  'dst alpha': 772,
  'one minus dst alpha': 773,
  'constant color': 32769,
  'one minus constant color': 32770,
  'constant alpha': 32771,
  'one minus constant alpha': 32772,
  'src alpha saturate': 776
}

var compareFuncs = {
  'never': 512,
  'less': 513,
  '<': 513,
  'equal': 514,
  '=': 514,
  '==': 514,
  '===': 514,
  'lequal': 515,
  '<=': 515,
  'greater': 516,
  '>': 516,
  'notequal': 517,
  '!=': 517,
  '!==': 517,
  'gequal': 518,
  '>=': 518,
  'always': 519
}

var stencilOps = {
  '0': 0,
  'zero': 0,
  'keep': 7680,
  'replace': 7681,
  'increment': 7682,
  'decrement': 7683,
  'increment wrap': 34055,
  'decrement wrap': 34056,
  'invert': 5386
}

function typeLength (x) {
  switch (x) {
    case GL_FLOAT_VEC2:
    case GL_INT_VEC2:
    case GL_BOOL_VEC2:
      return 2
    case GL_FLOAT_VEC3:
    case GL_INT_VEC3:
    case GL_BOOL_VEC3:
      return 3
    case GL_FLOAT_VEC4:
    case GL_INT_VEC4:
    case GL_BOOL_VEC4:
      return 4
    default:
      return 1
  }
}

function setUniformString (gl, type, location, value) {
  var infix
  var separator = ','
  switch (type) {
    case GL_FLOAT:
      infix = '1f'
      break
    case GL_FLOAT_VEC2:
      infix = '2fv'
      break
    case GL_FLOAT_VEC3:
      infix = '3fv'
      break
    case GL_FLOAT_VEC4:
      infix = '4fv'
      break
    case GL_BOOL:
    case GL_INT:
      infix = '1i'
      break
    case GL_BOOL_VEC2:
    case GL_INT_VEC2:
      infix = '2iv'
      break
    case GL_BOOL_VEC3:
    case GL_INT_VEC3:
      infix = '3iv'
      break
    case GL_BOOL_VEC4:
    case GL_INT_VEC4:
      infix = '4iv'
      break
    case GL_FLOAT_MAT2:
      infix = 'Matrix2fv'
      separator = ',false,'
      break
    case GL_FLOAT_MAT3:
      infix = 'Matrix3fv'
      separator = ',false,'
      break
    case GL_FLOAT_MAT4:
      infix = 'Matrix4fv'
      separator = ',false,'
      break
    default:
      
  }
  return gl + '.uniform' + infix + '(' + location + separator + value + ');'
}

function stackTop (x) {
  return x + '[' + x + '.length-1]'
}

// Need to process framebuffer first in options list
function optionPriority (a, b) {
  if (a === 'framebuffer') {
    return -1
  }
  if (a < b) {
    return -1
  } else if (a > b) {
    return 1
  }
  return 0
}

module.exports = function reglCompiler (
  gl,
  stringStore,
  extensions,
  limits,
  bufferState,
  elementState,
  textureState,
  framebufferState,
  glState,
  uniformState,
  attributeState,
  shaderState,
  drawState,
  frameState,
  reglPoll) {
  var contextState = glState.contextState

  var blendEquations = {
    'add': 32774,
    'subtract': 32778,
    'reverse subtract': 32779
  }
  if (extensions.ext_blend_minmax) {
    blendEquations.min = GL_MIN_EXT
    blendEquations.max = GL_MAX_EXT
  }

  var drawCallCounter = 0

  // ===================================================
  // ===================================================
  // SHADER SINGLE DRAW OPERATION
  // ===================================================
  // ===================================================
  function compileShaderDraw (program) {
    var env = createEnvironment()
    var link = env.link
    var draw = env.proc('draw')
    var def = draw.def

    var GL = link(gl)
    var PROGRAM = link(program.program)
    var BIND_ATTRIBUTE = link(attributeState.bind)
    var DRAW_STATE = {
      count: link(drawState.count),
      offset: link(drawState.offset),
      instances: link(drawState.instances),
      primitive: link(drawState.primitive)
    }
    var ELEMENT_STATE = link(elementState.elements)
    var TEXTURE_UNIFORMS = []

    // bind the program
    draw(GL, '.useProgram(', PROGRAM, ');')

    // set up attribute state
    program.attributes.forEach(function (attribute) {
      var STACK = link(attributeState.def(attribute.name))
      draw(BIND_ATTRIBUTE, '(',
        attribute.location, ',',
        link(attributeState.bindings[attribute.location]), ',',
        STACK, '.records[', STACK, '.top]', ',',
        typeLength(attribute.info.type), ');')
    })

    // set up uniforms
    program.uniforms.forEach(function (uniform) {
      var LOCATION = link(uniform.location)
      var STACK = link(uniformState.def(uniform.name))
      var TOP = STACK + '[' + STACK + '.length-1]'
      var type = uniform.info.type
      if (type === GL_SAMPLER_2D || type === GL_SAMPLER_CUBE) {
        var TEX_VALUE = def(TOP + '._texture')
        TEXTURE_UNIFORMS.push(TEX_VALUE)
        draw(setUniformString(GL, GL_INT, LOCATION, TEX_VALUE + '.bind()'))
      } else {
        draw(setUniformString(GL, type, LOCATION, TOP))
      }
    })

    // unbind textures immediately
    TEXTURE_UNIFORMS.forEach(function (TEX_VALUE) {
      draw(TEX_VALUE, '.unbind();')
    })

    // Execute draw command
    var CUR_PRIMITIVE = def(stackTop(DRAW_STATE.primitive))
    var CUR_COUNT = def(stackTop(DRAW_STATE.count))
    var CUR_OFFSET = def(stackTop(DRAW_STATE.offset))
    var CUR_ELEMENTS = def(stackTop(ELEMENT_STATE))

    // Only execute draw command if number elements is > 0
    draw('if(', CUR_COUNT, '){')

    var instancing = extensions.angle_instanced_arrays
    if (instancing) {
      var CUR_INSTANCES = def(stackTop(DRAW_STATE.instances))
      var INSTANCE_EXT = link(instancing)
      draw(
        'if(', CUR_ELEMENTS, '){',
        CUR_ELEMENTS, '.bind();',
        'if(', CUR_INSTANCES, '>0){',
        INSTANCE_EXT, '.drawElementsInstancedANGLE(',
        CUR_PRIMITIVE, ',',
        CUR_COUNT, ',',
        CUR_ELEMENTS, '.type,',
        CUR_OFFSET, ',',
        CUR_INSTANCES, ');}else{',
        GL, '.drawElements(',
        CUR_PRIMITIVE, ',',
        CUR_COUNT, ',',
        CUR_ELEMENTS, '.type,',
        CUR_OFFSET, ');}',
        '}else if(', CUR_INSTANCES, '>0){',
        INSTANCE_EXT, '.drawArraysInstancedANGLE(',
        CUR_PRIMITIVE, ',',
        CUR_OFFSET, ',',
        CUR_COUNT, ',',
        CUR_INSTANCES, ');}else{',
        GL, '.drawArrays(',
        CUR_PRIMITIVE, ',',
        CUR_OFFSET, ',',
        CUR_COUNT, ');}}')
    } else {
      draw(
        'if(', CUR_ELEMENTS, '){',
        GL, '.drawElements(',
        CUR_PRIMITIVE, ',',
        CUR_COUNT, ',',
        CUR_ELEMENTS, '.type,',
        CUR_OFFSET, ');}',
        '}else{',
        GL, '.drawArrays(',
        CUR_PRIMITIVE, ',',
        CUR_OFFSET, ',',
        CUR_COUNT, ');}')
    }

    return env.compile().draw
  }

  // ===================================================
  // ===================================================
  // BATCH DRAW OPERATION
  // ===================================================
  // ===================================================
  function compileBatch (
    program, options, uniforms, attributes, staticOptions) {
    // -------------------------------
    // code generation helpers
    // -------------------------------
    var env = createEnvironment()
    var link = env.link
    var batch = env.proc('batch')
    var exit = env.block()
    var def = batch.def
    var arg = batch.arg

    // -------------------------------
    // regl state
    // -------------------------------
    var GL = link(gl)
    var PROGRAM = link(program.program)
    var BIND_ATTRIBUTE = link(attributeState.bind)
    var FRAME_STATE = link(frameState)
    var FRAMEBUFFER_STATE = link(framebufferState)
    var DRAW_STATE = {
      count: link(drawState.count),
      offset: link(drawState.offset),
      instances: link(drawState.instances),
      primitive: link(drawState.primitive)
    }
    var CONTEXT_STATE = {}
    var ELEMENTS = link(elementState.elements)
    var CUR_COUNT = def(stackTop(DRAW_STATE.count))
    var CUR_OFFSET = def(stackTop(DRAW_STATE.offset))
    var CUR_PRIMITIVE = def(stackTop(DRAW_STATE.primitive))
    var CUR_ELEMENTS = def(stackTop(ELEMENTS))
    var CUR_INSTANCES
    var INSTANCE_EXT
    var instancing = extensions.angle_instanced_arrays
    if (instancing) {
      CUR_INSTANCES = def(stackTop(DRAW_STATE.instances))
      INSTANCE_EXT = link(instancing)
    }
    var hasDynamicElements = 'elements' in options

    function linkContext (x) {
      var result = CONTEXT_STATE[x]
      if (result) {
        return result
      }
      result = CONTEXT_STATE[x] = link(contextState[x])
      return result
    }

    // -------------------------------
    // batch/argument vars
    // -------------------------------
    var NUM_ARGS = arg()
    var ARGS = arg()
    var ARG = def()
    var BATCH_ID = def()

    // -------------------------------
    // load a dynamic variable
    // -------------------------------
    var dynamicVars = {}
    function dyn (x) {
      var id = x.id
      var result = dynamicVars[id]
      if (result) {
        return result
      }
      if (x.func) {
        result = batch.def(
          link(x.data), '(', ARG, ',', BATCH_ID, ',', FRAME_STATE, ')')
      } else {
        result = batch.def(ARG, '.', x.data)
      }
      dynamicVars[id] = result
      return result
    }

    // -------------------------------
    // retrieves the first name-matching record from an ActiveInfo list
    // -------------------------------
    function findInfo (list, name) {
      return list.find(function (item) {
        return item.name === name
      })
    }

    // -------------------------------
    // bind shader
    // -------------------------------
    batch(GL, '.useProgram(', PROGRAM, ');')

    // -------------------------------
    // set static uniforms
    // -------------------------------
    program.uniforms.forEach(function (uniform) {
      if (uniform.name in uniforms) {
        return
      }
      var LOCATION = link(uniform.location)
      var STACK = link(uniformState.def(uniform.name))
      var TOP = STACK + '[' + STACK + '.length-1]'
      var type = uniform.info.type
      if (type === GL_SAMPLER_2D || type === GL_SAMPLER_CUBE) {
        var TEX_VALUE = def(TOP + '._texture')
        batch(setUniformString(GL, GL_INT, LOCATION, TEX_VALUE + '.bind()'))
        exit(TEX_VALUE, '.unbind();')
      } else {
        batch(setUniformString(GL, type, LOCATION, TOP))
      }
    })

    // -------------------------------
    // set static attributes
    // -------------------------------
    program.attributes.forEach(function (attribute) {
      if (attributes.name in attributes) {
        return
      }
      var STACK = link(attributeState.def(attribute.name))
      batch(BIND_ATTRIBUTE, '(',
        attribute.location, ',',
        link(attributeState.bindings[attribute.location]), ',',
        STACK, '.records[', STACK, '.top]', ',',
        typeLength(attribute.info.type), ');')
    })

    // -------------------------------
    // set static element buffer
    // -------------------------------
    if (!hasDynamicElements) {
      batch(
        'if(', CUR_ELEMENTS, '){',
        GL, '.bindBuffer(', GL_ELEMENT_ARRAY_BUFFER, ',', CUR_ELEMENTS, '.buffer.buffer);',
        '}else{',
        GL, '.bindBuffer(', GL_ELEMENT_ARRAY_BUFFER, ',null);',
        '}')
    }

    // -------------------------------
    // loop over all arguments
    // -------------------------------
    batch(
      'for(', BATCH_ID, '=0;', BATCH_ID, '<', NUM_ARGS, ';++', BATCH_ID, '){',
      ARG, '=', ARGS, '[', BATCH_ID, '];')

    // -------------------------------
    // set dynamic flags
    // -------------------------------
    Object.keys(options).sort(optionPriority).forEach(function (option) {
      var VALUE = dyn(options[option])

      function setCap (flag) {
        batch(
          'if(', VALUE, '){',
          GL, '.enable(', flag, ');}else{',
          GL, '.disable(', flag, ');}')
      }

      switch (option) {
        case 'framebuffer':
          var VIEWPORT_STATE = linkContext('viewport')
          var SCISSOR_STATE = linkContext('scissor.box')
          batch(
            'if(', FRAMEBUFFER_STATE, '.push(',
            VALUE, '&&', VALUE, '._framebuffer)){',
            FRAMEBUFFER_STATE, '.poll();',
            VIEWPORT_STATE, '.setDirty();',
            SCISSOR_STATE, '.setDirty();',
            '}')
          break

        // Caps
        case 'cull.enable':
          setCap(GL_CULL_FACE)
          break
        case 'blend.enable':
          setCap(GL_BLEND)
          break
        case 'dither':
          setCap(GL_DITHER)
          break
        case 'stencil.enable':
          setCap(GL_STENCIL_TEST)
          break
        case 'depth.enable':
          setCap(GL_DEPTH_TEST)
          break
        case 'scissor.enable':
          setCap(GL_SCISSOR_TEST)
          break
        case 'polygonOffset.enable':
          setCap(GL_POLYGON_OFFSET_FILL)
          break
        case 'sample.alpha':
          setCap(GL_SAMPLE_ALPHA_TO_COVERAGE)
          break
        case 'sample.enable':
          setCap(GL_SAMPLE_COVERAGE)
          break

        case 'depth.mask':
          batch(GL, '.depthMask(', VALUE, ');')
          break

        case 'depth.func':
          var DEPTH_FUNCS = link(compareFuncs)
          batch(GL, '.depthFunc(', DEPTH_FUNCS, '[', VALUE, ']);')
          break

        case 'depth.range':
          batch(GL, '.depthRange(', VALUE, '[0],', VALUE, '[1]);')
          break

        case 'blend.color':
          batch(GL, '.blendColor(',
            VALUE, '[0],',
            VALUE, '[1],',
            VALUE, '[2],',
            VALUE, '[3]);')
          break

        case 'blend.equation':
          var BLEND_EQUATIONS = link(blendEquations)
          batch(
            'if(typeof ', VALUE, '==="string"){',
            GL, '.blendEquation(', BLEND_EQUATIONS, '[', VALUE, ']);',
            '}else{',
            GL, '.blendEquationSeparate(',
            BLEND_EQUATIONS, '[', VALUE, '.rgb],',
            BLEND_EQUATIONS, '[', VALUE, '.alpha]);',
            '}')
          break

        case 'blend.func':
          var BLEND_FUNCS = link(blendFuncs)
          batch(
            GL, '.blendFuncSeparate(',
            BLEND_FUNCS,
            '["srcRGB" in ', VALUE, '?', VALUE, '.srcRGB:', VALUE, '.src],',
            BLEND_FUNCS,
            '["dstRGB" in ', VALUE, '?', VALUE, '.dstRGB:', VALUE, '.dst],',
            BLEND_FUNCS,
            '["srcAlpha" in ', VALUE, '?', VALUE, '.srcAlpha:', VALUE, '.src],',
            BLEND_FUNCS,
            '["dstAlpha" in ', VALUE, '?', VALUE, '.dstAlpha:', VALUE, '.dst]);')
          break

        case 'stencil.mask':
          batch(GL, '.stencilMask(', VALUE, ');')
          break

        case 'stencil.func':
          var STENCIL_FUNCS = link(compareFuncs)
          batch(GL, '.stencilFunc(',
            STENCIL_FUNCS, '[', VALUE, '.cmp||"always"],',
            VALUE, '.ref|0,',
            '"mask" in ', VALUE, '?', VALUE, '.mask:-1);')
          break

        case 'stencil.opFront':
        case 'stencil.opBack':
          var STENCIL_OPS = link(stencilOps)
          batch(GL, '.stencilOpSeparate(',
            option === 'stencil.opFront' ? GL_FRONT : GL_BACK, ',',
            STENCIL_OPS, '[', VALUE, '.fail||"keep"],',
            STENCIL_OPS, '[', VALUE, '.zfail||"keep"],',
            STENCIL_OPS, '[', VALUE, '.pass||"keep"]);')
          break

        case 'polygonOffset.offset':
          batch(GL, '.polygonOffset(',
            VALUE, '.factor||0,',
            VALUE, '.units||0);')
          break

        case 'cull.face':
          batch(GL, '.cullFace(',
            VALUE, '==="front"?', GL_FRONT, ':', GL_BACK, ');')
          break

        case 'lineWidth':
          batch(GL, '.lineWidth(', VALUE, ');')
          break

        case 'frontFace':
          batch(GL, '.frontFace(',
            VALUE, '==="cw"?', GL_CW, ':', GL_CCW, ');')
          break

        case 'colorMask':
          batch(GL, '.colorMask(',
            VALUE, '[0],',
            VALUE, '[1],',
            VALUE, '[2],',
            VALUE, '[3]);')
          break

        case 'sample.coverage':
          batch(GL, '.sampleCoverage(',
            VALUE, '.value,',
            VALUE, '.invert);')
          break

        case 'scissor.box':
        case 'viewport':
          var BOX_STATE = linkContext(option)
          batch(BOX_STATE, '.push(',
            VALUE, '.x||0,',
            VALUE, '.y||0,',
            VALUE, '.w||-1,',
            VALUE, '.h||-1);')
          break

        case 'primitives':
        case 'offset':
        case 'count':
        case 'elements':
          break

        default:
          
      }
    })

    // update viewport/scissor box state and restore framebuffer
    if ('viewport' in options || 'framebuffer' in options) {
      batch(linkContext('viewport'), '.poll();')
    }
    if ('scissor.box' in options || 'framebuffer' in options) {
      batch(linkContext('scissor.box'), '.poll();')
    }
    if ('framebuffer' in options) {
      batch(FRAMEBUFFER_STATE, '.pop();')
    }

    // -------------------------------
    // set dynamic uniforms
    // -------------------------------
    var programUniforms = program.uniforms
    var DYNAMIC_TEXTURES = []
    Object.keys(uniforms).forEach(function (uniform) {
      var data = findInfo(programUniforms, uniform)
      if (!data) {
        return
      }
      var TYPE = data.info.type
      var LOCATION = link(data.location)
      var VALUE = dyn(uniforms[uniform])
      if (data.info.type === GL_SAMPLER_2D ||
          data.info.type === GL_SAMPLER_CUBE) {
        var TEX_VALUE = def(VALUE + '._texture')
        DYNAMIC_TEXTURES.push(TEX_VALUE)
        batch(setUniformString(GL, GL_INT, LOCATION, TEX_VALUE + '.bind()'))
      } else {
        batch(setUniformString(GL, TYPE, LOCATION, VALUE))
      }
    })
    DYNAMIC_TEXTURES.forEach(function (VALUE) {
      batch(VALUE, '.unbind();')
    })

    // -------------------------------
    // set dynamic attributes
    // -------------------------------
    var programAttributes = program.attributes
    Object.keys(attributes).forEach(function (attribute) {
      var data = findInfo(programAttributes, attribute)
      if (!data) {
        return
      }
      batch(BIND_ATTRIBUTE, '(',
        data.location, ',',
        link(attribute.bindings[data.location]), ',',
        dyn(attributes[attribute]), ',',
        typeLength(data.info.type), ');')
    })

    // -------------------------------
    // set dynamic attributes
    // -------------------------------

    if (options.count) {
      batch(CUR_COUNT, '=', dyn(options.count), ';')
    } else if (!useElementOption('count')) {
      batch('if(', CUR_COUNT, '){')
    }
    if (options.offset) {
      batch(CUR_OFFSET, '=', dyn(options.offset), ';')
    }
    if (options.primitive) {
      var PRIM_TYPES = link(primTypes)
      batch(CUR_PRIMITIVE, '=', PRIM_TYPES, '[', dyn(options.primitive), '];')
    }

    function useElementOption (x) {
      return hasDynamicElements && !(x in options || x in staticOptions)
    }
    if (hasDynamicElements) {
      var dynElements = dyn(options.elements)
      batch(CUR_ELEMENTS, '=',
        dynElements, '?', dynElements, '._elements:null;')
    }
    if (useElementOption('offset')) {
      batch(CUR_OFFSET, '=0;')
    }

    // Emit draw command
    batch('if(', CUR_ELEMENTS, '){')
    if (useElementOption('count')) {
      batch(CUR_COUNT, '=', CUR_ELEMENTS, '.vertCount;',
        'if(', CUR_COUNT, '>0){')
    }
    if (useElementOption('primitive')) {
      batch(CUR_PRIMITIVE, '=', CUR_ELEMENTS, '.primType;')
    }
    if (hasDynamicElements) {
      batch(
        GL,
        '.bindBuffer(',
        GL_ELEMENT_ARRAY_BUFFER, ',',
        CUR_ELEMENTS, '.buffer.buffer);')
    }
    if (instancing) {
      if (options.instances) {
        batch(CUR_INSTANCES, '=', dyn(options.instances), ';')
      }
      batch(
        'if(', CUR_INSTANCES, '>0){',
        INSTANCE_EXT, '.drawElementsInstancedANGLE(',
        CUR_PRIMITIVE, ',',
        CUR_COUNT, ',',
        CUR_ELEMENTS, '.type,',
        CUR_OFFSET, ',',
        CUR_INSTANCES, ');}else{')
    }
    batch(
      GL, '.drawElements(',
      CUR_PRIMITIVE, ',',
      CUR_COUNT, ',',
      CUR_ELEMENTS, '.type,',
      CUR_OFFSET, ');')
    if (instancing) {
      batch('}')
    }
    if (useElementOption('count')) {
      batch('}')
    }
    batch('}else{')
    if (!useElementOption('count')) {
      if (useElementOption('primitive')) {
        batch(CUR_PRIMITIVE, '=', GL_TRIANGLES, ';')
      }
      if (instancing) {
        batch(
          'if(', CUR_INSTANCES, '>0){',
          INSTANCE_EXT, '.drawArraysInstancedANGLE(',
          CUR_PRIMITIVE, ',',
          CUR_OFFSET, ',',
          CUR_COUNT, ',',
          CUR_INSTANCES, ');}else{')
      }
      batch(
        GL, '.drawArrays(',
        CUR_PRIMITIVE, ',',
        CUR_OFFSET, ',',
        CUR_COUNT, ');}')
      if (instancing) {
        batch('}')
      }
    }
    batch('}}', exit)

    // -------------------------------
    // compile and return
    // -------------------------------
    return env.compile().batch
  }

  // ===================================================
  // ===================================================
  // MAIN DRAW COMMAND
  // ===================================================
  // ===================================================
  function compileCommand (
    staticOptions, staticUniforms, staticAttributes,
    dynamicOptions, dynamicUniforms, dynamicAttributes,
    hasDynamic) {
    // Create code generation environment
    var env = createEnvironment()
    var link = env.link
    var block = env.block
    var proc = env.proc

    var callId = drawCallCounter++

    // -------------------------------
    // Common state variables
    // -------------------------------
    var GL_POLL = link(reglPoll)
    var STRING_STORE = link(stringStore)
    var FRAG_SHADER_STATE = link(shaderState.fragShaders)
    var VERT_SHADER_STATE = link(shaderState.vertShaders)
    var PROGRAM_STATE = link(shaderState.programs)
    var FRAMEBUFFER_STATE = link(framebufferState)
    var DRAW_STATE = {
      count: link(drawState.count),
      offset: link(drawState.offset),
      instances: link(drawState.instances),
      primitive: link(drawState.primitive)
    }
    var ELEMENT_STATE = link(elementState.elements)
    var PRIM_TYPES = link(primTypes)
    var COMPARE_FUNCS = link(compareFuncs)
    var STENCIL_OPS = link(stencilOps)

    var CONTEXT_STATE = {}
    function linkContext (x) {
      var result = CONTEXT_STATE[x]
      if (result) {
        return result
      }
      result = CONTEXT_STATE[x] = link(contextState[x])
      return result
    }

    // ==========================================================
    // STATIC STATE
    // ==========================================================
    // Code blocks for the static sections
    var entry = block()
    var exit = block()

    // -------------------------------
    // update default context state variables
    // -------------------------------
    function handleStaticOption (param, value) {
      var STATE_STACK = linkContext(param)
      entry(STATE_STACK, '.push(', value, ');')
      exit(STATE_STACK, '.pop();')
    }

    var hasShader = false
    Object.keys(staticOptions).sort(optionPriority).forEach(function (param) {
      var value = staticOptions[param]
      switch (param) {
        case 'frag':
          hasShader = true
          entry(FRAG_SHADER_STATE, '.push(', link(stringStore.id(value)), ');')
          exit(FRAG_SHADER_STATE, '.pop();')
          break

        case 'vert':
          hasShader = true
          entry(VERT_SHADER_STATE, '.push(', link(stringStore.id(value)), ');')
          exit(VERT_SHADER_STATE, '.pop();')
          break

        case 'framebuffer':
          var fbo = framebufferState.getFramebuffer(value)
          
          var VIEWPORT_STATE = linkContext('viewport')
          var SCISSOR_STATE = linkContext('scissor.box')
          entry('if(', FRAMEBUFFER_STATE, '.push(', link(
            value && value._framebuffer), ')){',
            VIEWPORT_STATE, '.setDirty();',
            SCISSOR_STATE, '.setDirty();',
            '}')
          exit('if(', FRAMEBUFFER_STATE, '.pop()){',
            VIEWPORT_STATE, '.setDirty();',
            SCISSOR_STATE, '.setDirty();',
            '}')
          break

        // Update draw state
        case 'count':
        case 'offset':
        case 'instances':
          
          entry(DRAW_STATE[param], '.push(', value, ');')
          exit(DRAW_STATE[param], '.pop();')
          break

        // Update primitive type
        case 'primitive':
          
          var primType = primTypes[value]
          entry(DRAW_STATE.primitive, '.push(', primType, ');')
          exit(DRAW_STATE.primitive, '.pop();')
          break

        // Update element buffer
        case 'elements':
          var elements = elementState.getElements(value)
          var hasPrimitive = !('primitive' in staticOptions)
          var hasCount = !('count' in staticOptions)
          if (elements) {
            var ELEMENTS = link(elements)
            entry(ELEMENT_STATE, '.push(', ELEMENTS, ');')
            if (hasPrimitive) {
              entry(DRAW_STATE.primitive, '.push(', ELEMENTS, '.primType);')
            }
            if (hasCount) {
              entry(DRAW_STATE.count, '.push(', ELEMENTS, '.vertCount);')
            }
          } else {
            entry(ELEMENT_STATE, '.push(null);')
            if (hasPrimitive) {
              entry(DRAW_STATE.primitive, '.push(', GL_TRIANGLES, ');')
            }
            if (hasCount) {
              entry(DRAW_STATE.count, '.push(0);')
            }
          }
          if (hasPrimitive) {
            exit(DRAW_STATE.primitive, '.pop();')
          }
          if (hasCount) {
            exit(DRAW_STATE.count, '.pop();')
          }
          if (!('offset' in staticOptions)) {
            entry(DRAW_STATE.offset, '.push(0);')
            exit(DRAW_STATE.offset, '.pop();')
          }
          exit(ELEMENT_STATE, '.pop();')
          break

        case 'cull.enable':
        case 'blend.enable':
        case 'dither':
        case 'stencil.enable':
        case 'depth.enable':
        case 'scissor.enable':
        case 'polygonOffset.enable':
        case 'sample.alpha':
        case 'sample.enable':
        case 'depth.mask':
          
          handleStaticOption(param, value)
          break

        case 'depth.func':
          
          handleStaticOption(param, compareFuncs[value])
          break

        case 'depth.range':
          
          var DEPTH_RANGE_STACK = linkContext(param)
          entry(DEPTH_RANGE_STACK, '.push(', value[0], ',', value[1], ');')
          exit(DEPTH_RANGE_STACK, '.pop();')
          break

        case 'blend.func':
          var BLEND_FUNC_STACK = linkContext(param)
          
          var srcRGB = ('srcRGB' in value ? value.srcRGB : value.src)
          var srcAlpha = ('srcAlpha' in value ? value.srcAlpha : value.src)
          var dstRGB = ('dstRGB' in value ? value.dstRGB : value.dst)
          var dstAlpha = ('dstAlpha' in value ? value.dstAlpha : value.dst)
          
          
          
          
          entry(BLEND_FUNC_STACK, '.push(',
            blendFuncs[srcRGB], ',',
            blendFuncs[dstRGB], ',',
            blendFuncs[srcAlpha], ',',
            blendFuncs[dstAlpha], ');')
          exit(BLEND_FUNC_STACK, '.pop();')
          break

        case 'blend.equation':
          var BLEND_EQUATION_STACK = linkContext(param)
          if (typeof value === 'string') {
            
            entry(BLEND_EQUATION_STACK,
              '.push(',
              blendEquations[value], ',',
              blendEquations[value], ');')
          } else if (typeof value === 'object') {
            
            
            entry(BLEND_EQUATION_STACK,
              '.push(',
              blendEquations[value.rgb], ',',
              blendEquations[value.alpha], ');')
          } else {
            
          }
          exit(BLEND_EQUATION_STACK, '.pop();')
          break

        case 'blend.color':
          
          var BLEND_COLOR_STACK = linkContext(param)
          entry(BLEND_COLOR_STACK,
            '.push(',
            value[0], ',',
            value[1], ',',
            value[2], ',',
            value[3], ');')
          exit(BLEND_COLOR_STACK, '.pop();')
          break

        case 'stencil.mask':
          
          var STENCIL_MASK_STACK = linkContext(param)
          entry(STENCIL_MASK_STACK, '.push(', value, ');')
          exit(STENCIL_MASK_STACK, '.pop();')
          break

        case 'stencil.func':
          
          var cmp = value.cmp || 'keep'
          var ref = value.ref || 0
          var mask = 'mask' in value ? value.mask : -1
          
          
          
          var STENCIL_FUNC_STACK = linkContext(param)
          entry(STENCIL_FUNC_STACK, '.push(',
            compareFuncs[cmp], ',',
            ref, ',',
            mask, ');')
          exit(STENCIL_FUNC_STACK, '.pop();')
          break

        case 'stencil.opFront':
        case 'stencil.opBack':
          
          var fail = value.fail || 'keep'
          var zfail = value.zfail || 'keep'
          var pass = value.pass || 'keep'
          
          
          
          var STENCIL_OP_STACK = linkContext(param)
          entry(STENCIL_OP_STACK, '.push(',
            stencilOps[fail], ',',
            stencilOps[zfail], ',',
            stencilOps[pass], ');')
          exit(STENCIL_OP_STACK, '.pop();')
          break

        case 'polygonOffset.offset':
          
          var factor = value.factor || 0
          var units = value.units || 0
          
          
          var POLYGON_OFFSET_STACK = linkContext(param)
          entry(POLYGON_OFFSET_STACK, '.push(',
            factor, ',', units, ');')
          exit(POLYGON_OFFSET_STACK, '.pop();')
          break

        case 'cull.face':
          var face = 0
          if (value === 'front') {
            face = GL_FRONT
          } else if (value === 'back') {
            face = GL_BACK
          }
          
          var CULL_FACE_STACK = linkContext(param)
          entry(CULL_FACE_STACK, '.push(', face, ');')
          exit(CULL_FACE_STACK, '.pop();')
          break

        case 'lineWidth':
          var lineWidthDims = limits.lineWidthDims
          
          handleStaticOption(param, value)
          break

        case 'frontFace':
          var orientation = 0
          if (value === 'cw') {
            orientation = GL_CW
          } else if (value === 'ccw') {
            orientation = GL_CCW
          }
          
          var FRONT_FACE_STACK = linkContext(param)
          entry(FRONT_FACE_STACK, '.push(', orientation, ');')
          exit(FRONT_FACE_STACK, '.pop();')
          break

        case 'colorMask':
          
          var COLOR_MASK_STACK = linkContext(param)
          entry(COLOR_MASK_STACK, '.push(',
            value.map(function (v) { return !!v }).join(),
            ');')
          exit(COLOR_MASK_STACK, '.pop();')
          break

        case 'sample.coverage':
          
          var sampleValue = 'value' in value ? value.value : 1
          var sampleInvert = !!value.invert
          
          var SAMPLE_COVERAGE_STACK = linkContext(param)
          entry(SAMPLE_COVERAGE_STACK, '.push(',
            sampleValue, ',', sampleInvert, ');')
          exit(SAMPLE_COVERAGE_STACK, '.pop();')
          break

        case 'viewport':
        case 'scissor.box':
          
          var X = value.x || 0
          var Y = value.y || 0
          var W = -1
          var H = -1
          
          
          if ('w' in value) {
            W = value.w
            
          }
          if ('h' in value) {
            H = value.h
            
          }
          var BOX_STACK = linkContext(param)
          entry(BOX_STACK, '.push(', X, ',', Y, ',', W, ',', H, ');')
          exit(BOX_STACK, '.pop();')
          break

        default:
          // TODO Should this just be a warning instead?
          
          break
      }
    })

    // -------------------------------
    // update shader program
    // -------------------------------
    if (hasShader) {
      if (staticOptions.frag && staticOptions.vert) {
        var fragSrc = staticOptions.frag
        var vertSrc = staticOptions.vert
        entry(PROGRAM_STATE, '.push(',
          link(shaderState.create(
            stringStore.id(vertSrc),
            stringStore.id(fragSrc))), ');')
      } else {
        var FRAG_SRC = entry.def(
          FRAG_SHADER_STATE, '[', FRAG_SHADER_STATE, '.length-1]')
        var VERT_SRC = entry.def(
          VERT_SHADER_STATE, '[', VERT_SHADER_STATE, '.length-1]')
        var LINK_PROG = link(shaderState.create)
        entry(
          PROGRAM_STATE, '.push(',
          LINK_PROG, '(', VERT_SRC, ',', FRAG_SRC, '));')
      }
      exit(PROGRAM_STATE, '.pop();')
    }

    // -------------------------------
    // update static uniforms
    // -------------------------------
    Object.keys(staticUniforms).forEach(function (uniform) {
      var STACK = link(uniformState.def(uniform))
      var VALUE
      var value = staticUniforms[uniform]
      if (typeof value === 'function' && value._reglType) {
        VALUE = link(value)
      } else if (Array.isArray(value)) {
        VALUE = link(value.slice())
      } else {
        VALUE = +value
      }
      entry(STACK, '.push(', VALUE, ');')
      exit(STACK, '.pop();')
    })

    // -------------------------------
    // update default attributes
    // -------------------------------
    Object.keys(staticAttributes).forEach(function (attribute) {
      var ATTRIBUTE = link(attributeState.def(attribute))

      var data = staticAttributes[attribute]
      if (typeof data === 'number') {
        entry(ATTRIBUTE, '.pushVec(', +data, ',0,0,0);')
      } else {
        

        if (Array.isArray(data)) {
          entry(
            ATTRIBUTE, '.pushVec(',
            [data[0] || 0, data[1] || 0, data[2] || 0, data[3] || 0], ');')
        } else {
          var buffer = bufferState.getBuffer(data)
          var size = 0
          var stride = 0
          var offset = 0
          var divisor = 0
          var normalized = false
          var type = GL_FLOAT

          if (!buffer) {
            

            buffer = bufferState.getBuffer(data.buffer)
            size = data.size || 0
            stride = data.stride || 0
            offset = data.offset || 0
            divisor = data.divisor || 0
            normalized = data.normalized || false

            

            // Check for user defined type overloading
            type = buffer.dtype
            if ('type' in data) {
              
              type = glTypes[data.type]
            }
          } else {
            type = buffer.dtype
          }

          
          
          
          
          
          

          entry(
            ATTRIBUTE, '.pushPtr(', [
              link(buffer), size, offset, stride,
              divisor, normalized, type
            ].join(), ');')
        }
      }
      exit(ATTRIBUTE, '.pop();')
    })

    // ==========================================================
    // DYNAMIC STATE (for scope and draw)
    // ==========================================================
    // Generated code blocks for dynamic state flags
    var dynamicEntry = env.block()
    var dynamicExit = env.block()

    var FRAMESTATE
    var DYNARGS
    if (hasDynamic) {
      FRAMESTATE = link(frameState)
      DYNARGS = entry.def()
    }

    var dynamicVars = {}
    function dyn (x) {
      var id = x.id
      var result = dynamicVars[id]
      if (result) {
        return result
      }
      if (x.func) {
        result = dynamicEntry.def(
          link(x.data), '(', DYNARGS, ',0,', FRAMESTATE, ')')
      } else {
        result = dynamicEntry.def(DYNARGS, '.', x.data)
      }
      dynamicVars[id] = result
      return result
    }

    // -------------------------------
    // dynamic context state variables
    // -------------------------------
    Object.keys(dynamicOptions).sort(optionPriority).forEach(function (param) {
      // Link in dynamic variable
      var variable = dyn(dynamicOptions[param])

      switch (param) {
        case 'framebuffer':
          var VIEWPORT_STATE = linkContext('viewport')
          var SCISSOR_STATE = linkContext('scissor.box')
          dynamicEntry('if(',
            FRAMEBUFFER_STATE, '.push(',
            variable, '&&', variable, '._framebuffer)){',
            VIEWPORT_STATE, '.setDirty();',
            SCISSOR_STATE, '.setDirty();',
            '}')
          dynamicExit('if(',
            FRAMEBUFFER_STATE, '.pop()){',
            VIEWPORT_STATE, '.setDirty();',
            SCISSOR_STATE, '.setDirty();',
            '}')
          break

        case 'cull.enable':
        case 'blend.enable':
        case 'dither':
        case 'stencil.enable':
        case 'depth.enable':
        case 'scissor.enable':
        case 'polygonOffset.enable':
        case 'sample.alpha':
        case 'sample.enable':
        case 'lineWidth':
        case 'depth.mask':
          var STATE_STACK = linkContext(param)
          dynamicEntry(STATE_STACK, '.push(', variable, ');')
          dynamicExit(STATE_STACK, '.pop();')
          break

        // Draw calls
        case 'count':
        case 'offset':
        case 'instances':
          var DRAW_STACK = DRAW_STATE[param]
          dynamicEntry(DRAW_STACK, '.push(', variable, ');')
          dynamicExit(DRAW_STACK, '.pop();')
          break

        case 'primitive':
          var PRIM_STACK = DRAW_STATE.primitive
          dynamicEntry(PRIM_STACK, '.push(', PRIM_TYPES, '[', variable, ']);')
          dynamicExit(PRIM_STACK, '.pop();')
          break

        case 'depth.func':
          var DEPTH_FUNC_STACK = linkContext(param)
          dynamicEntry(DEPTH_FUNC_STACK, '.push(', COMPARE_FUNCS, '[', variable, ']);')
          dynamicExit(DEPTH_FUNC_STACK, '.pop();')
          break

        case 'blend.func':
          var BLEND_FUNC_STACK = linkContext(param)
          var BLEND_FUNCS = link(blendFuncs)
          dynamicEntry(
            BLEND_FUNC_STACK, '.push(',
            BLEND_FUNCS,
            '["srcRGB" in ', variable, '?', variable, '.srcRGB:', variable, '.src],',
            BLEND_FUNCS,
            '["dstRGB" in ', variable, '?', variable, '.dstRGB:', variable, '.dst],',
            BLEND_FUNCS,
            '["srcAlpha" in ', variable, '?', variable, '.srcAlpha:', variable, '.src],',
            BLEND_FUNCS,
            '["dstAlpha" in ', variable, '?', variable, '.dstAlpha:', variable, '.dst]);')
          dynamicExit(BLEND_FUNC_STACK, '.pop();')
          break

        case 'blend.equation':
          var BLEND_EQUATION_STACK = linkContext(param)
          var BLEND_EQUATIONS = link(blendEquations)
          dynamicEntry(
            'if(typeof ', variable, '==="string"){',
            BLEND_EQUATION_STACK, '.push(',
            BLEND_EQUATIONS, '[', variable, '],',
            BLEND_EQUATIONS, '[', variable, ']);',
            '}else{',
            BLEND_EQUATION_STACK, '.push(',
            BLEND_EQUATIONS, '[', variable, '.rgb],',
            BLEND_EQUATIONS, '[', variable, '.alpha]);',
            '}')
          dynamicExit(BLEND_EQUATION_STACK, '.pop();')
          break

        case 'blend.color':
          var BLEND_COLOR_STACK = linkContext(param)
          dynamicEntry(BLEND_COLOR_STACK, '.push(',
            variable, '[0],',
            variable, '[1],',
            variable, '[2],',
            variable, '[3]);')
          dynamicExit(BLEND_COLOR_STACK, '.pop();')
          break

        case 'stencil.mask':
          var STENCIL_MASK_STACK = linkContext(param)
          dynamicEntry(STENCIL_MASK_STACK, '.push(', variable, ');')
          dynamicExit(STENCIL_MASK_STACK, '.pop();')
          break

        case 'stencil.func':
          var STENCIL_FUNC_STACK = linkContext(param)
          dynamicEntry(STENCIL_FUNC_STACK, '.push(',
            COMPARE_FUNCS, '[', variable, '.cmp],',
            variable, '.ref|0,',
            '"mask" in ', variable, '?', variable, '.mask:-1);')
          dynamicExit(STENCIL_FUNC_STACK, '.pop();')
          break

        case 'stencil.opFront':
        case 'stencil.opBack':
          var STENCIL_OP_STACK = linkContext(param)
          dynamicEntry(STENCIL_OP_STACK, '.push(',
            STENCIL_OPS, '[', variable, '.fail||"keep"],',
            STENCIL_OPS, '[', variable, '.zfail||"keep"],',
            STENCIL_OPS, '[', variable, '.pass||"keep"]);')
          dynamicExit(STENCIL_OP_STACK, '.pop();')
          break

        case 'polygonOffset.offset':
          var POLYGON_OFFSET_STACK = linkContext(param)
          dynamicEntry(POLYGON_OFFSET_STACK, '.push(',
            variable, '.factor||0,',
            variable, '.units||0);')
          dynamicExit(POLYGON_OFFSET_STACK, '.pop();')
          break

        case 'cull.face':
          var CULL_FACE_STACK = linkContext(param)
          dynamicEntry(CULL_FACE_STACK, '.push(',
            variable, '==="front"?', GL_FRONT, ':', GL_BACK, ');')
          dynamicExit(CULL_FACE_STACK, '.pop();')
          break

        case 'frontFace':
          var FRONT_FACE_STACK = linkContext(param)
          dynamicEntry(FRONT_FACE_STACK, '.push(',
            variable, '==="cw"?', GL_CW, ':', GL_CCW, ');')
          dynamicExit(FRONT_FACE_STACK, '.pop();')
          break

        case 'colorMask':
          var COLOR_MASK_STACK = linkContext(param)
          dynamicEntry(COLOR_MASK_STACK, '.push(',
            variable, '[0],',
            variable, '[1],',
            variable, '[2],',
            variable, '[3]);')
          dynamicExit(COLOR_MASK_STACK, '.pop();')
          break

        case 'sample.coverage':
          var SAMPLE_COVERAGE_STACK = linkContext(param)
          dynamicEntry(SAMPLE_COVERAGE_STACK, '.push(',
            variable, '.value,',
            variable, '.invert);')
          dynamicExit(SAMPLE_COVERAGE_STACK, '.pop();')
          break

        case 'scissor.box':
        case 'viewport':
          var BOX_STACK = linkContext(param)
          dynamicEntry(BOX_STACK, '.push(',
            variable, '.x||0,',
            variable, '.y||0,',
            '"w" in ', variable, '?', variable, '.w:-1,',
            '"h" in ', variable, '?', variable, '.h:-1);')
          dynamicExit(BOX_STACK, '.pop();')
          break

        case 'elements':
          var hasPrimitive =
          !('primitive' in dynamicOptions) &&
            !('primitive' in staticOptions)
          var hasCount =
          !('count' in dynamicOptions) &&
            !('count' in staticOptions)
          var hasOffset =
          !('offset' in dynamicOptions) &&
            !('offset' in staticOptions)
          var ELEMENTS = dynamicEntry.def()
          dynamicEntry(
            'if(', variable, '){',
            ELEMENTS, '=', variable, '._elements;',
            ELEMENT_STATE, '.push(', ELEMENTS, ');',
            !hasPrimitive ? ''
              : DRAW_STATE.primitive + '.push(' + ELEMENTS + '.primType);',
            !hasCount ? ''
              : DRAW_STATE.count + '.push(' + ELEMENTS + '.vertCount);',
            !hasOffset ? ''
              : DRAW_STATE.offset + '.push(' + ELEMENTS + '.offset);',
            '}else{',
            ELEMENT_STATE, '.push(null);',
            '}')
          dynamicExit(
            ELEMENT_STATE, '.pop();',
            'if(', variable, '){',
            hasPrimitive ? DRAW_STATE.primitive + '.pop();' : '',
            hasCount ? DRAW_STATE.count + '.pop();' : '',
            hasOffset ? DRAW_STATE.offset + '.pop();' : '',
            '}')
          break

        default:
          
      }
    })

    // -------------------------------
    // dynamic uniforms
    // -------------------------------
    Object.keys(dynamicUniforms).forEach(function (uniform) {
      var STACK = link(uniformState.def(uniform))
      var VALUE = dyn(dynamicUniforms[uniform])
      dynamicEntry(STACK, '.push(', VALUE, ');')
      dynamicExit(STACK, '.pop();')
    })

    // -------------------------------
    // dynamic attributes
    // -------------------------------
    Object.keys(dynamicAttributes).forEach(function (attribute) {
      var ATTRIBUTE = link(attributeState.def(attribute))
      var VALUE = dyn(dynamicAttributes[attribute])
      dynamicEntry(ATTRIBUTE, '.pushDyn(', VALUE, ');')
      dynamicExit(ATTRIBUTE, '.pop();')
    })

    // ==========================================================
    // SCOPE PROCEDURE
    // ==========================================================
    var scope = proc('scope')
    var SCOPE_ARGS = scope.arg()
    var SCOPE_BODY = scope.arg()
    scope(entry)
    if (hasDynamic) {
      scope(
        DYNARGS, '=', SCOPE_ARGS, ';',
        dynamicEntry)
    }
    scope(
      SCOPE_BODY, '();',
      hasDynamic ? dynamicExit : '',
      exit)

    // ==========================================================
    // DRAW PROCEDURE
    // ==========================================================
    var draw = proc('draw')
    draw(entry)
    if (hasDynamic) {
      draw(
        DYNARGS, '=', draw.arg(), ';',
        dynamicEntry)
    }
    var CURRENT_SHADER = stackTop(PROGRAM_STATE)
    draw(
      GL_POLL, '();',
      'if(', CURRENT_SHADER, ')',
      CURRENT_SHADER, '.draw(', hasDynamic ? DYNARGS : '', ');',
      hasDynamic ? dynamicExit : '',
      exit)

    // ==========================================================
    // BATCH DRAW
    // ==========================================================
    var batch = proc('batch')
    batch(entry)
    var CUR_SHADER = batch.def(stackTop(PROGRAM_STATE))
    var EXEC_BATCH = link(function (program, count, args) {
      var proc = program.batchCache[callId]
      if (!proc) {
        proc = program.batchCache[callId] = compileBatch(
          program, dynamicOptions, dynamicUniforms, dynamicAttributes,
          staticOptions)
      }
      return proc(count, args)
    })
    batch(
      'if(', CUR_SHADER, '){',
      GL_POLL, '();',
      EXEC_BATCH, '(',
      CUR_SHADER, ',',
      batch.arg(), ',',
      batch.arg(), ');')
    // Set dirty on all dynamic flags
    Object.keys(dynamicOptions).forEach(function (option) {
      var STATE = CONTEXT_STATE[option]
      if (STATE) {
        batch(STATE, '.setDirty();')
      }
    })
    batch('}', exit)

    // -------------------------------
    // eval and bind
    // -------------------------------
    return env.compile()
  }

  return {
    draw: compileShaderDraw,
    command: compileCommand
  }
}

},{"./codegen":5,"./constants/dtypes.json":8,"./constants/primitives.json":9}],7:[function(require,module,exports){
module.exports={
  "[object Int8Array]": 5120
, "[object Int16Array]": 5122
, "[object Int32Array]": 5124
, "[object Uint8Array]": 5121
, "[object Uint8ClampedArray]": 5121
, "[object Uint16Array]": 5123
, "[object Uint32Array]": 5125
, "[object Float32Array]": 5126
, "[object Float64Array]": 5121
, "[object ArrayBuffer]": 5121
}

},{}],8:[function(require,module,exports){
module.exports={
  "int8": 5120
, "int16": 5122
, "int32": 5124
, "uint8": 5121
, "uint16": 5123
, "uint32": 5125
, "float": 5126
}

},{}],9:[function(require,module,exports){
module.exports={
  "points": 0,
  "lines": 1,
  "line loop": 2,
  "line strip": 3,
  "triangles": 4,
  "triangle strip": 5,
  "triangle fan": 6
}

},{}],10:[function(require,module,exports){
// Context and canvas creation helper functions
/*globals HTMLElement,WebGLRenderingContext*/


var extend = require('./extend')

function createCanvas (element, options) {
  var canvas = document.createElement('canvas')
  var args = getContext(canvas, options)

  extend(canvas.style, {
    border: 0,
    margin: 0,
    padding: 0,
    top: 0,
    left: 0
  })
  element.appendChild(canvas)

  if (element === document.body) {
    canvas.style.position = 'absolute'
    extend(element.style, {
      margin: 0,
      padding: 0
    })
  }

  var scale = +args.options.pixelRatio
  function resize () {
    var w = window.innerWidth
    var h = window.innerHeight
    if (element !== document.body) {
      var bounds = element.getBoundingClientRect()
      w = bounds.right - bounds.left
      h = bounds.top - bounds.bottom
    }
    canvas.width = scale * w
    canvas.height = scale * h
    extend(canvas.style, {
      width: w + 'px',
      height: h + 'px'
    })
  }

  window.addEventListener('resize', resize, false)

  var prevDestroy = args.options.onDestroy
  args.options = extend(extend({}, args.options), {
    onDestroy: function () {
      window.removeEventListener('resize', resize)
      element.removeChild(canvas)
      prevDestroy && prevDestroy()
    }
  })

  resize()

  return args
}

function getContext (canvas, options) {
  var glOptions = options.glOptions || {}

  function get (name) {
    try {
      return canvas.getContext(name, glOptions)
    } catch (e) {
      return null
    }
  }

  var gl = get('webgl') ||
           get('experimental-webgl') ||
           get('webgl-experimental')

  

  return {
    gl: gl,
    options: extend({
      pixelRatio: window.devicePixelRatio
    }, options)
  }
}

module.exports = function parseArgs (args) {
  if (typeof document === 'undefined' ||
      typeof HTMLElement === 'undefined') {
    return {
      gl: args[0],
      options: args[1] || {}
    }
  }

  var element = document.body
  var options = args[1] || {}

  if (typeof args[0] === 'string') {
    element = document.querySelector(args[0]) || document.body
  } else if (typeof args[0] === 'object') {
    if (args[0] instanceof HTMLElement) {
      element = args[0]
    } else if (args[0] instanceof WebGLRenderingContext) {
      return {
        gl: args[0],
        options: extend({
          pixelRatio: 1
        }, options)
      }
    } else {
      options = args[0]
    }
  }

  if (element.nodeName && element.nodeName.toUpperCase() === 'CANVAS') {
    return getContext(element, options)
  } else {
    return createCanvas(element, options)
  }
}

},{"./extend":14}],11:[function(require,module,exports){
var GL_TRIANGLES = 4

module.exports = function wrapDrawState (gl) {
  var primitive = [ GL_TRIANGLES ]
  var count = [ 0 ]
  var offset = [ 0 ]
  var instances = [ 0 ]

  return {
    primitive: primitive,
    count: count,
    offset: offset,
    instances: instances
  }
}

},{}],12:[function(require,module,exports){
var VARIABLE_COUNTER = 0

function DynamicVariable (isFunc, data) {
  this.id = (VARIABLE_COUNTER++)
  this.func = isFunc
  this.data = data
}

function defineDynamic (data, path) {
  switch (typeof data) {
    case 'boolean':
    case 'number':
    case 'string':
      return new DynamicVariable(false, data)
    case 'function':
      return new DynamicVariable(true, data)
    default:
      return defineDynamic
  }
}

function isDynamic (x) {
  return (typeof x === 'function' && !x._reglType) ||
         x instanceof DynamicVariable
}

function unbox (x, path) {
  if (x instanceof DynamicVariable) {
    return x
  } else if (typeof x === 'function' &&
             x !== defineDynamic) {
    return new DynamicVariable(true, x)
  }
  return new DynamicVariable(false, path)
}

module.exports = {
  define: defineDynamic,
  isDynamic: isDynamic,
  unbox: unbox
}

},{}],13:[function(require,module,exports){

var isTypedArray = require('./is-typed-array')
var isNDArrayLike = require('./is-ndarray')
var primTypes = require('./constants/primitives.json')

var GL_POINTS = 0
var GL_LINES = 1
var GL_TRIANGLES = 4

var GL_BYTE = 5120
var GL_UNSIGNED_BYTE = 5121
var GL_SHORT = 5122
var GL_UNSIGNED_SHORT = 5123
var GL_INT = 5124
var GL_UNSIGNED_INT = 5125

var GL_ELEMENT_ARRAY_BUFFER = 34963

module.exports = function wrapElementsState (gl, extensions, bufferState) {
  var elements = [ null ]

  function REGLElementBuffer () {
    this.buffer = null
    this.primType = GL_TRIANGLES
    this.vertCount = 0
    this.type = 0
  }

  REGLElementBuffer.prototype.bind = function () {
    this.buffer.bind()
  }

  function createElements (options) {
    var elements = new REGLElementBuffer()
    var buffer = bufferState.create(null, GL_ELEMENT_ARRAY_BUFFER, true)
    elements.buffer = buffer._buffer

    function reglElements (input) {
      var options = input
      var ext32bit = extensions.oes_element_index_uint

      // Upload data to vertex buffer
      if (!options) {
        buffer()
      } else if (typeof options === 'number') {
        buffer(options)
      } else {
        var data = null
        var usage = 'static'
        var byteLength = 0
        if (
          Array.isArray(options) ||
          isTypedArray(options) ||
          isNDArrayLike(options)) {
          data = options
        } else {
          
          if ('data' in options) {
            data = options.data
          }
          if ('usage' in options) {
            usage = options.usage
          }
          if ('length' in options) {
            byteLength = options.length
          }
        }
        if (Array.isArray(data) ||
            (isNDArrayLike(data) && data.dtype === 'array') ||
            'type' in options) {
          buffer({
            type: options.type ||
              (ext32bit
                ? 'uint32'
                : 'uint16'),
            usage: usage,
            data: data,
            length: byteLength
          })
        } else {
          buffer({
            usage: usage,
            data: data,
            length: byteLength
          })
        }
        if (Array.isArray(data) || isTypedArray(data)) {
          buffer.dimension = 3
        }
      }

      // try to guess default primitive type and arguments
      var vertCount = elements.buffer.byteLength
      var type = 0
      switch (elements.buffer.dtype) {
        case GL_UNSIGNED_BYTE:
        case GL_BYTE:
          type = GL_UNSIGNED_BYTE
          break

        case GL_UNSIGNED_SHORT:
        case GL_SHORT:
          type = GL_UNSIGNED_SHORT
          vertCount >>= 1
          break

        case GL_UNSIGNED_INT:
        case GL_INT:
          
          type = GL_UNSIGNED_INT
          vertCount >>= 2
          break

        default:
          
      }

      // try to guess primitive type from cell dimension
      var primType = GL_TRIANGLES
      var dimension = elements.buffer.dimension
      if (dimension === 1) primType = GL_POINTS
      if (dimension === 2) primType = GL_LINES
      if (dimension === 3) primType = GL_TRIANGLES

      // if manual override present, use that
      if (typeof options === 'object') {
        if ('primitive' in options) {
          var primitive = options.primitive
          
          primType = primTypes[primitive]
        }

        if ('count' in options) {
          vertCount = options.vertCount | 0
        }
      }

      // update properties for element buffer
      elements.primType = primType
      elements.vertCount = vertCount
      elements.type = type

      return reglElements
    }

    reglElements(options)

    reglElements._reglType = 'elements'
    reglElements._elements = elements
    reglElements.destroy = function () {
      
      buffer.destroy()
      elements.buffer = null
    }

    return reglElements
  }

  return {
    create: createElements,
    elements: elements,
    getElements: function (elements) {
      if (elements && elements._elements instanceof REGLElementBuffer) {
        return elements._elements
      }
      return null
    }
  }
}

},{"./constants/primitives.json":9,"./is-ndarray":17,"./is-typed-array":18}],14:[function(require,module,exports){
module.exports = function (base, opts) {
  var keys = Object.keys(opts)
  for (var i = 0; i < keys.length; ++i) {
    base[keys[i]] = opts[keys[i]]
  }
  return base
}

},{}],15:[function(require,module,exports){
module.exports = function createExtensionCache (gl) {
  var extensions = {}

  function refreshExtensions () {
    [
      'oes_texture_float',
      'oes_texture_float_linear',
      'oes_texture_half_float',
      'oes_texture_half_float_linear',
      'oes_standard_derivatives',
      'oes_element_index_uint',
      'oes_fbo_render_mipmap',

      'webgl_depth_texture',
      'webgl_draw_buffers',
      'webgl_color_buffer_float',

      'ext_texture_filter_anisotropic',
      'ext_frag_depth',
      'ext_blend_minmax',
      'ext_shader_texture_lod',
      'ext_color_buffer_half_float',
      'ext_srgb',

      'angle_instanced_arrays',

      'webgl_compressed_texture_s3tc',
      'webgl_compressed_texture_atc',
      'webgl_compressed_texture_pvrtc',
      'webgl_compressed_texture_etc1'
    ].forEach(function (ext) {
      try {
        extensions[ext] = gl.getExtension(ext)
      } catch (e) {}
    })
  }

  refreshExtensions()

  return {
    extensions: extensions,
    refresh: refreshExtensions
  }
}

},{}],16:[function(require,module,exports){

var values = require('./values')
var extend = require('./extend')

// We store these constants so that the minifier can inline them
var GL_FRAMEBUFFER = 0x8D40
var GL_RENDERBUFFER = 0x8D41

var GL_TEXTURE_2D = 0x0DE1
var GL_TEXTURE_CUBE_MAP = 0x8513
var GL_TEXTURE_CUBE_MAP_POSITIVE_X = 0x8515

var GL_COLOR_ATTACHMENT0 = 0x8CE0
var GL_DEPTH_ATTACHMENT = 0x8D00
var GL_STENCIL_ATTACHMENT = 0x8D20
var GL_DEPTH_STENCIL_ATTACHMENT = 0x821A

var GL_UNSIGNED_BYTE = 0x1401
var GL_FLOAT = 0x1406

var GL_HALF_FLOAT_OES = 0x8D61

var GL_ALPHA = 0x1906
var GL_LUMINANCE = 0x1909
var GL_LUMINANCE_ALPHA = 0x190A
var GL_RGB = 0x1907
var GL_RGBA = 0x1908

var GL_RGBA4 = 0x8056
var GL_RGB5_A1 = 0x8057
var GL_RGB565 = 0x8D62
var GL_DEPTH_COMPONENT16 = 0x81A5
var GL_STENCIL_INDEX8 = 0x8D48

var GL_DEPTH_COMPONENT = 0x1902
var GL_DEPTH_STENCIL = 0x84F9

var GL_SRGB8_ALPHA8_EXT = 0x8C43

var GL_RGBA32F_EXT = 0x8814

var GL_RGBA16F_EXT = 0x881A
var GL_RGB16F_EXT = 0x881B

var GL_FRAMEBUFFER_COMPLETE = 0x8CD5
var GL_FRAMEBUFFER_INCOMPLETE_ATTACHMENT = 0x8CD6
var GL_FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT = 0x8CD7
var GL_FRAMEBUFFER_INCOMPLETE_DIMENSIONS = 0x8CD9
var GL_FRAMEBUFFER_UNSUPPORTED = 0x8CDD

var GL_BACK = 1029

var BACK_BUFFER = [GL_BACK]

module.exports = function wrapFBOState (
  gl,
  extensions,
  limits,
  textureState,
  renderbufferState) {
  var statusCode = {}
  statusCode[GL_FRAMEBUFFER_COMPLETE] = 'complete'
  statusCode[GL_FRAMEBUFFER_INCOMPLETE_ATTACHMENT] = 'incomplete attachment'
  statusCode[GL_FRAMEBUFFER_INCOMPLETE_DIMENSIONS] = 'incomplete dimensions'
  statusCode[GL_FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT] = 'incomplete, missing attachment'
  statusCode[GL_FRAMEBUFFER_UNSUPPORTED] = 'unsupported'

  var colorTextureFormats = {
    'rgba': GL_RGBA
  }

  var colorRenderbufferFormats = {
    'rgba4': GL_RGBA4,
    'rgb565': GL_RGB565,
    'rgb5 a1': GL_RGB5_A1
  }

  if (extensions.ext_srgb) {
    colorRenderbufferFormats['srgba'] = GL_SRGB8_ALPHA8_EXT
  }

  if (extensions.ext_color_buffer_half_float) {
    colorRenderbufferFormats['rgba16f'] = GL_RGBA16F_EXT
    colorRenderbufferFormats['rgb16f'] = GL_RGB16F_EXT
  }

  if (extensions.webgl_color_buffer_float) {
    colorRenderbufferFormats['rgba32f'] = GL_RGBA32F_EXT
  }

  var depthRenderbufferFormatEnums = [GL_DEPTH_COMPONENT16]
  var stencilRenderbufferFormatEnums = [GL_STENCIL_INDEX8]
  var depthStencilRenderbufferFormatEnums = [GL_DEPTH_STENCIL]

  var depthTextureFormatEnums = []
  var stencilTextureFormatEnums = []
  var depthStencilTextureFormatEnums = []

  if (extensions.webgl_depth_texture) {
    depthTextureFormatEnums.push(GL_DEPTH_COMPONENT)
    depthStencilTextureFormatEnums.push(GL_DEPTH_STENCIL)
  }

  var colorFormats = extend(extend({},
    colorTextureFormats),
    colorRenderbufferFormats)

  var colorTextureFormatEnums = values(colorTextureFormats)
  var colorRenderbufferFormatEnums = values(colorRenderbufferFormats)

  var highestPrecision = GL_UNSIGNED_BYTE
  var colorTypes = {
    'uint8': GL_UNSIGNED_BYTE
  }
  if (extensions.oes_texture_half_float) {
    highestPrecision = colorTypes['half float'] = GL_HALF_FLOAT_OES
  }
  if (extensions.oes_texture_float) {
    highestPrecision = colorTypes.float = GL_FLOAT
  }
  colorTypes.best = highestPrecision

  var DRAW_BUFFERS = (function () {
    var result = new Array(limits.maxDrawbuffers)
    for (var i = 0; i <= limits.maxDrawbuffers; ++i) {
      var row = result[i] = new Array(i)
      for (var j = 0; j < i; ++j) {
        row[j] = GL_COLOR_ATTACHMENT0 + j
      }
    }
    return result
  })()

  function FramebufferAttachment (target, level, texture, renderbuffer) {
    this.target = target
    this.level = level
    this.texture = texture
    this.renderbuffer = renderbuffer
  }

  function decRef (attachment) {
    if (attachment) {
      if (attachment.texture) {
        attachment.texture._texture.decRef()
      }
      if (attachment.renderbuffer) {
        attachment.renderbuffer._renderbuffer.decRef()
      }
    }
  }

  function checkFormat (attachment, texFormats, rbFormats) {
    if (attachment.texture) {
      
    } else {
      
    }
  }

  function incRefAndCheckShape (attachment, framebuffer) {
    var width = framebuffer.width
    var height = framebuffer.height
    if (attachment.texture) {
      var texture = attachment.texture._texture
      var tw = Math.max(1, texture.params.width >> attachment.level)
      var th = Math.max(1, texture.params.height >> attachment.level)
      width = width || tw
      height = height || th
      
      
      texture.refCount += 1
    } else {
      var renderbuffer = attachment.renderbuffer._renderbuffer
      width = width || renderbuffer.width
      height = height || renderbuffer.height
      
      
      renderbuffer.refCount += 1
    }
    framebuffer.width = width
    framebuffer.height = height
  }

  function attach (location, attachment) {
    if (attachment) {
      if (attachment.texture) {
        gl.framebufferTexture2D(
          GL_FRAMEBUFFER,
          location,
          attachment.target,
          attachment.texture._texture.texture,
          attachment.level)
      } else {
        gl.framebufferRenderbuffer(
          GL_FRAMEBUFFER,
          location,
          GL_RENDERBUFFER,
          attachment.renderbuffer._renderbuffer.renderbuffer)
      }
    } else {
      gl.framebufferTexture2D(
        GL_FRAMEBUFFER,
        location,
        GL_TEXTURE_2D,
        null,
        0)
    }
  }

  function tryUpdateAttachment (
    attachment,
    isTexture,
    format,
    type,
    width,
    height) {
    if (attachment.texture) {
      var texture = attachment.texture
      if (isTexture) {
        texture({
          format: format,
          type: type,
          width: width,
          height: height
        })
        texture._texture.refCount += 1
        return true
      }
    } else {
      var renderbuffer = attachment.renderbuffer
      if (!isTexture) {
        renderbuffer({
          format: format,
          width: width,
          height: height
        })
        renderbuffer._renderbuffer.refCount += 1
        return true
      }
    }
    decRef(attachment)
    return false
  }

  function parseAttachment (attachment) {
    var target = GL_TEXTURE_2D
    var level = 0
    var texture = null
    var renderbuffer = null

    var data = attachment
    if (typeof attachment === 'object') {
      data = attachment.data
      if ('level' in attachment) {
        level = attachment.level | 0
      }
      if ('target' in attachment) {
        target = attachment.target | 0
      }
    }

    

    var type = attachment._reglType
    if (type === 'texture') {
      texture = attachment
      if (texture._texture.target === GL_TEXTURE_CUBE_MAP) {
        
      } else {
        
      }
      // TODO check miplevel is consistent
    } else if (type === 'renderbuffer') {
      renderbuffer = attachment
      target = GL_RENDERBUFFER
      level = 0
    } else {
      
    }

    return new FramebufferAttachment(target, level, texture, renderbuffer)
  }

  function unwrapAttachment (attachment) {
    return attachment && (attachment.texture || attachment.renderbuffer)
  }

  var framebufferCount = 0
  var framebufferSet = {}
  var framebufferStack = [null]
  var framebufferDirty = true

  function REGLFramebuffer () {
    this.id = framebufferCount++
    framebufferSet[this.id] = this

    this.framebuffer = null
    this.width = 0
    this.height = 0

    this.colorAttachments = []
    this.depthAttachment = null
    this.stencilAttachment = null
    this.depthStencilAttachment = null

    this.ownsColor = false
    this.ownsDepthStencil = false
  }

  function refresh (framebuffer) {
    if (!gl.isFramebuffer(framebuffer.framebuffer)) {
      framebuffer.framebuffer = gl.createFramebuffer()
    }
    framebufferDirty = true
    gl.bindFramebuffer(GL_FRAMEBUFFER, framebuffer.framebuffer)

    var colorAttachments = framebuffer.colorAttachments
    for (var i = 0; i < colorAttachments.length; ++i) {
      attach(GL_COLOR_ATTACHMENT0 + i, colorAttachments[i])
    }
    for (i = colorAttachments.length; i < limits.maxColorAttachments; ++i) {
      attach(GL_COLOR_ATTACHMENT0 + i, null)
    }
    attach(GL_DEPTH_ATTACHMENT, framebuffer.depthAttachment)
    attach(GL_STENCIL_ATTACHMENT, framebuffer.stencilAttachment)
    attach(GL_DEPTH_STENCIL_ATTACHMENT, framebuffer.depthStencilAttachment)

    if (extensions.webgl_draw_buffers) {
      extensions.webgl_draw_buffers.drawBuffersWEBGL(
        DRAW_BUFFERS[colorAttachments.length])
    }

    // Check status code
    var status = gl.checkFramebufferStatus(GL_FRAMEBUFFER)
    if (status !== GL_FRAMEBUFFER_COMPLETE) {
      
    }
  }

  function decFBORefs (framebuffer) {
    framebuffer.colorAttachments.forEach(decRef)
    decRef(framebuffer.depthAttachment)
    decRef(framebuffer.stencilAttachment)
    decRef(framebuffer.depthStencilAttachment)
  }

  function destroy (framebuffer) {
    var handle = framebuffer.framebuffer
    
    if (gl.isFramebuffer(handle)) {
      gl.deleteFramebuffer(handle)
    }
  }

  function createFBO (options) {
    var framebuffer = new REGLFramebuffer()

    function reglFramebuffer (input) {
      var i
      var options = input || {}

      var extDrawBuffers = extensions.webgl_draw_buffers

      var width = 0
      var height = 0
      if ('shape' in options) {
        var shape = options.shape
        
        width = shape[0]
        height = shape[1]
      } else {
        if ('radius' in options) {
          width = height = options.radius
        }
        if ('width' in options) {
          width = options.width
        }
        if ('height' in options) {
          height = options.height
        }
      }

      // colorType, numColors
      var colorBuffers = null
      var ownsColor = false
      if ('colorBuffers' in options || 'colorBuffer' in options) {
        var colorInputs = options.colorBuffers || options.colorBuffer
        if (!Array.isArray(colorInputs)) {
          colorInputs = [colorInputs]
        }

        framebuffer.width = width
        framebuffer.height = height

        if (colorInputs.length > 1) {
          
        }
        

        // Wrap color attachments
        colorBuffers = colorInputs.map(parseAttachment)

        // Check head node
        for (i = 0; i < colorBuffers.length; ++i) {
          var colorAttachment = colorBuffers[i]
          checkFormat(
            colorAttachment,
            colorTextureFormatEnums,
            colorRenderbufferFormatEnums)
          incRefAndCheckShape(
            colorAttachment,
            framebuffer)
        }

        width = framebuffer.width
        height = framebuffer.height
      } else {
        var colorTexture = true
        var colorFormat = 'rgba'
        var colorType = 'uint8'
        var colorCount = 1
        ownsColor = true

        framebuffer.width = width || gl.drawingBufferWidth
        framebuffer.height = height || gl.drawingBufferHeight

        if ('format' in options) {
          colorFormat = options.format
          
          colorTexture = colorFormat in colorTextureFormats
        }

        if ('type' in options) {
          
          colorType = options.type
          
        }

        if ('colorCount' in options) {
          colorCount = options.colorCount | 0
          
        }

        // Reuse color buffer array if we own it
        if (framebuffer.ownsColor) {
          colorBuffers = framebuffer.colorAttachments
          while (colorBuffers.length > colorCount) {
            decRef(colorBuffers.pop())
          }
        } else {
          colorBuffers = []
        }

        // update buffers in place, remove incompatible buffers
        for (i = 0; i < colorBuffers.length; ++i) {
          if (!tryUpdateAttachment(
              colorBuffers[i],
              colorTexture,
              colorFormat,
              colorType,
              width,
              height)) {
            colorBuffers[i--] = colorBuffers[colorBuffers.length - 1]
            colorBuffers.pop()
          }
        }

        // Then append new buffers
        while (colorBuffers.length < colorCount) {
          if (colorTexture) {
            colorBuffers.push(new FramebufferAttachment(
              GL_TEXTURE_2D,
              0,
              textureState.create({
                format: colorFormat,
                type: colorType,
                width: width,
                height: height
              }, GL_TEXTURE_2D),
              null))
          } else {
            colorBuffers.push(new FramebufferAttachment(
              GL_RENDERBUFFER,
              0,
              null,
              renderbufferState.create({
                format: colorFormat,
                width: width,
                height: height
              })))
          }
        }
      }

      

      framebuffer.width = width
      framebuffer.height = height

      var depthBuffer = null
      var stencilBuffer = null
      var depthStencilBuffer = null
      var ownsDepthStencil = false
      var depthStencilCount = 0

      if ('depthBuffer' in options) {
        depthBuffer = parseAttachment(options.depthBuffer)
        checkFormat(
          depthBuffer,
          depthTextureFormatEnums,
          depthRenderbufferFormatEnums)
        depthStencilCount += 1
      }
      if ('stencilBuffer' in options) {
        stencilBuffer = parseAttachment(options.stencilBuffer)
        checkFormat(
          stencilBuffer,
          stencilTextureFormatEnums,
          stencilRenderbufferFormatEnums)
        depthStencilCount += 1
      }
      if ('depthStencilBuffer' in options) {
        depthStencilBuffer = parseAttachment(options.depthStencilBuffer)
        checkFormat(
          depthStencilBuffer,
          depthStencilTextureFormatEnums,
          depthStencilRenderbufferFormatEnums)
        depthStencilCount += 1
      }

      if (!(depthBuffer || stencilBuffer || depthStencilBuffer)) {
        var depth = true
        var stencil = false
        var useTexture = false

        if ('depth' in options) {
          depth = !!options.depth
        }
        if ('stencil' in options) {
          stencil = !!options.stencil
        }
        if ('depthTexture' in options) {
          useTexture = !!options.depthTexture
        }

        var curDepthStencil =
          framebuffer.depthAttachment ||
          framebuffer.stencilAttachment ||
          framebuffer.depthStencilAttachment
        var nextDepthStencil = null

        if (depth || stencil) {
          ownsDepthStencil = true

          if (useTexture) {
            
            var depthTextureFormat
            
            if (stencil) {
              depthTextureFormat = 'depth stencil'
            } else {
              depthTextureFormat = 'depth'
            }
            if (framebuffer.ownsDepthStencil && curDepthStencil.texture) {
              curDepthStencil.texture({
                format: depthTextureFormat,
                width: width,
                height: height
              })
              curDepthStencil.texture._texture.refCount += 1
              nextDepthStencil = curDepthStencil
            } else {
              nextDepthStencil = new FramebufferAttachment(
                GL_TEXTURE_2D,
                0,
                textureState.create({
                  format: depthTextureFormat,
                  width: width,
                  height: height
                }, GL_TEXTURE_2D),
                null)
            }
          } else {
            var depthRenderbufferFormat
            if (depth) {
              if (stencil) {
                depthRenderbufferFormat = 'depth stencil'
              } else {
                depthRenderbufferFormat = 'depth'
              }
            } else {
              depthRenderbufferFormat = 'stencil'
            }
            if (framebuffer.ownsDepthStencil && curDepthStencil.renderbuffer) {
              curDepthStencil.renderbuffer({
                format: depthRenderbufferFormat,
                width: width,
                height: height
              })
              curDepthStencil.renderbuffer._renderbuffer.refCount += 1
              nextDepthStencil = curDepthStencil
            } else {
              nextDepthStencil = new FramebufferAttachment(
                GL_RENDERBUFFER,
                0,
                null,
                renderbufferState.create({
                  format: depthRenderbufferFormat,
                  width: width,
                  height: height
                }))
            }
          }

          if (depth) {
            if (stencil) {
              depthStencilBuffer = nextDepthStencil
            } else {
              depthBuffer = nextDepthStencil
            }
          } else {
            stencilBuffer = nextDepthStencil
          }
        }
      } else {
        

        incRefAndCheckShape(
          depthBuffer ||
          stencilBuffer ||
          depthStencilBuffer,
          framebuffer)
      }

      decFBORefs(framebuffer)

      framebuffer.colorAttachments = colorBuffers
      framebuffer.depthAttachment = depthBuffer
      framebuffer.stencilAttachment = stencilBuffer
      framebuffer.depthStencilAttachment = depthStencilBuffer
      framebuffer.ownsColor = ownsColor
      framebuffer.ownsDepthStencil = ownsDepthStencil

      reglFramebuffer.color = colorBuffers.map(unwrapAttachment)
      reglFramebuffer.depth = unwrapAttachment(depthBuffer)
      reglFramebuffer.stencil = unwrapAttachment(stencilBuffer)
      reglFramebuffer.depthStencil = unwrapAttachment(depthStencilBuffer)

      refresh(framebuffer)

      reglFramebuffer.width = framebuffer.width
      reglFramebuffer.height = framebuffer.height

      return reglFramebuffer
    }

    reglFramebuffer(options)

    reglFramebuffer._reglType = 'framebuffer'
    reglFramebuffer._framebuffer = framebuffer
    reglFramebuffer._destroy = function () {
      destroy(framebuffer)
    }

    return reglFramebuffer
  }

  function refreshCache () {
    values(framebufferSet).forEach(refresh)
  }

  function clearCache () {
    values(framebufferSet).forEach(destroy)
  }

  function poll () {
    if (framebufferDirty) {
      var top = framebufferStack[framebufferStack.length - 1]
      var ext_drawbuffers = extensions.webgl_draw_buffers

      if (top) {
        gl.bindFramebuffer(GL_FRAMEBUFFER, top.framebuffer)
        if (ext_drawbuffers) {
          ext_drawbuffers.drawBuffersWEBGL(DRAW_BUFFERS[top.colorAttachments.length])
        }
      } else {
        gl.bindFramebuffer(GL_FRAMEBUFFER, null)
        if (ext_drawbuffers) {
          ext_drawbuffers.drawBuffersWEBGL(BACK_BUFFER)
        }
      }

      framebufferDirty = false
    }
  }

  function currentFramebuffer () {
    return framebufferStack[framebufferStack.length - 1]
  }

  return {
    top: currentFramebuffer,
    dirty: function () {
      return framebufferDirty
    },
    push: function (next_) {
      var next = next_ || null
      framebufferDirty = framebufferDirty || (next !== currentFramebuffer())
      framebufferStack.push(next)
      return framebufferDirty
    },
    pop: function () {
      var prev = currentFramebuffer()
      framebufferStack.pop()
      framebufferDirty = framebufferDirty || (prev !== currentFramebuffer())
      return framebufferDirty
    },
    getFramebuffer: function (object) {
      if (typeof object === 'function' && object._reglType === 'framebuffer') {
        var fbo = object._framebuffer
        if (fbo instanceof REGLFramebuffer) {
          return fbo
        }
      }
      return null
    },
    poll: poll,
    create: createFBO,
    clear: clearCache,
    refresh: refreshCache
  }
}

},{"./extend":14,"./values":32}],17:[function(require,module,exports){
var isTypedArray = require('./is-typed-array')

module.exports = function isNDArrayLike (obj) {
  return (
    typeof obj === 'object' &&
    Array.isArray(obj.shape) &&
    Array.isArray(obj.stride) &&
    typeof obj.offset === 'number' &&
    obj.shape.length === obj.stride.length &&
    (Array.isArray(obj.data) ||
      isTypedArray(obj.data)))
}

},{"./is-typed-array":18}],18:[function(require,module,exports){
var dtypes = require('./constants/arraytypes.json')
module.exports = function (x) {
  return Object.prototype.toString.call(x) in dtypes
}

},{"./constants/arraytypes.json":7}],19:[function(require,module,exports){
var GL_SUBPIXEL_BITS = 0x0D50
var GL_RED_BITS = 0x0D52
var GL_GREEN_BITS = 0x0D53
var GL_BLUE_BITS = 0x0D54
var GL_ALPHA_BITS = 0x0D55
var GL_DEPTH_BITS = 0x0D56
var GL_STENCIL_BITS = 0x0D57

var GL_ALIASED_POINT_SIZE_RANGE = 0x846D
var GL_ALIASED_LINE_WIDTH_RANGE = 0x846E

var GL_MAX_TEXTURE_SIZE = 0x0D33
var GL_MAX_VIEWPORT_DIMS = 0x0D3A
var GL_MAX_VERTEX_ATTRIBS = 0x8869
var GL_MAX_VERTEX_UNIFORM_VECTORS = 0x8DFB
var GL_MAX_VARYING_VECTORS = 0x8DFC
var GL_MAX_COMBINED_TEXTURE_IMAGE_UNITS = 0x8B4D
var GL_MAX_VERTEX_TEXTURE_IMAGE_UNITS = 0x8B4C
var GL_MAX_TEXTURE_IMAGE_UNITS = 0x8872
var GL_MAX_FRAGMENT_UNIFORM_VECTORS = 0x8DFD
var GL_MAX_CUBE_MAP_TEXTURE_SIZE = 0x851C
var GL_MAX_RENDERBUFFER_SIZE = 0x84E8

var GL_VENDOR = 0x1F00
var GL_RENDERER = 0x1F01
var GL_VERSION = 0x1F02
var GL_SHADING_LANGUAGE_VERSION = 0x8B8C

var GL_MAX_TEXTURE_MAX_ANISOTROPY_EXT = 0x84FF

var GL_MAX_COLOR_ATTACHMENTS_WEBGL = 0x8CDF
var GL_MAX_DRAW_BUFFERS_WEBGL = 0x8824

module.exports = function (gl, extensions) {
  var maxAnisotropic = 1
  if (extensions.ext_texture_filter_anisotropic) {
    maxAnisotropic = gl.getParameter(GL_MAX_TEXTURE_MAX_ANISOTROPY_EXT)
  }

  var maxDrawbuffers = 1
  var maxColorAttachments = 1
  if (extensions.webgl_draw_buffers) {
    maxDrawbuffers = gl.getParameter(GL_MAX_DRAW_BUFFERS_WEBGL)
    maxColorAttachments = gl.getParameter(GL_MAX_COLOR_ATTACHMENTS_WEBGL)
  }

  return {
    // drawing buffer bit depth
    colorBits: [
      gl.getParameter(GL_RED_BITS),
      gl.getParameter(GL_GREEN_BITS),
      gl.getParameter(GL_BLUE_BITS),
      gl.getParameter(GL_ALPHA_BITS)
    ],
    depthBits: gl.getParameter(GL_DEPTH_BITS),
    stencilBits: gl.getParameter(GL_STENCIL_BITS),
    subpixelBits: gl.getParameter(GL_SUBPIXEL_BITS),

    // supported extensions
    extensions: Object.keys(extensions).filter(function (ext) {
      return !!extensions[ext]
    }),

    // max aniso samples
    maxAnisotropic: maxAnisotropic,

    // max draw buffers
    maxDrawbuffers: maxDrawbuffers,
    maxColorAttachments: maxColorAttachments,

    // point and line size ranges
    pointSizeDims: gl.getParameter(GL_ALIASED_POINT_SIZE_RANGE),
    lineWidthDims: gl.getParameter(GL_ALIASED_LINE_WIDTH_RANGE),
    maxViewportDims: gl.getParameter(GL_MAX_VIEWPORT_DIMS),
    maxCombinedTextureUnits: gl.getParameter(GL_MAX_COMBINED_TEXTURE_IMAGE_UNITS),
    maxCubeMapSize: gl.getParameter(GL_MAX_CUBE_MAP_TEXTURE_SIZE),
    maxRenderbufferSize: gl.getParameter(GL_MAX_RENDERBUFFER_SIZE),
    maxTextureUnits: gl.getParameter(GL_MAX_TEXTURE_IMAGE_UNITS),
    maxTextureSize: gl.getParameter(GL_MAX_TEXTURE_SIZE),
    maxAttributes: gl.getParameter(GL_MAX_VERTEX_ATTRIBS),
    maxVertexUniforms: gl.getParameter(GL_MAX_VERTEX_UNIFORM_VECTORS),
    maxVertexTextureUnits: gl.getParameter(GL_MAX_VERTEX_TEXTURE_IMAGE_UNITS),
    maxVaryingVectors: gl.getParameter(GL_MAX_VARYING_VECTORS),
    maxFragmentUniforms: gl.getParameter(GL_MAX_FRAGMENT_UNIFORM_VECTORS),

    // vendor info
    glsl: gl.getParameter(GL_SHADING_LANGUAGE_VERSION),
    renderer: gl.getParameter(GL_RENDERER),
    vendor: gl.getParameter(GL_VENDOR),
    version: gl.getParameter(GL_VERSION)
  }
}

},{}],20:[function(require,module,exports){
/* globals document, Image, XMLHttpRequest */

module.exports = loadTexture

function getExtension (url) {
  var parts = /\.(\w+)(\?.*)?$/.exec(url)
  if (parts && parts[1]) {
    return parts[1].toLowerCase()
  }
}

function isVideoExtension (url) {
  return [
    'avi',
    'asf',
    'gifv',
    'mov',
    'qt',
    'yuv',
    'mpg',
    'mpeg',
    'm2v',
    'mp4',
    'm4p',
    'm4v',
    'ogg',
    'ogv',
    'vob',
    'webm',
    'wmv'
  ].indexOf(url) >= 0
}

function isCompressedExtension (url) {
  return [
    'dds'
  ].indexOf(url) >= 0
}

function loadVideo (url, crossOrigin) {
  var video = document.createElement('video')
  video.autoplay = true
  video.loop = true
  if (crossOrigin) {
    video.crossOrigin = crossOrigin
  }
  video.src = url
  return video
}

function loadCompressedTexture (url, ext, crossOrigin) {
  var xhr = new XMLHttpRequest()
  xhr.responseType = 'arraybuffer'
  xhr.open('GET', url, true)
  xhr.send()
  return xhr
}

function loadImage (url, crossOrigin) {
  var image = new Image()
  if (crossOrigin) {
    image.crossOrigin = crossOrigin
  }
  image.src = url
  return image
}

// Currently this stuff only works in a DOM environment
function loadTexture (url, crossOrigin) {
  if (typeof document !== 'undefined') {
    var ext = getExtension(url)
    if (isVideoExtension(ext)) {
      return loadVideo(url, crossOrigin)
    }
    if (isCompressedExtension(ext)) {
      return loadCompressedTexture(url, ext, crossOrigin)
    }
    return loadImage(url, crossOrigin)
  }
  return null
}

},{}],21:[function(require,module,exports){
// References:
//
// http://msdn.microsoft.com/en-us/library/bb943991.aspx/
// http://blog.tojicode.com/2011/12/compressed-textures-in-webgl.html
//


module.exports = parseDDS

var DDS_MAGIC = 0x20534444

var GL_TEXTURE_2D = 0x0DE1
var GL_TEXTURE_CUBE_MAP_POSITIVE_X = 0x8515

var GL_COMPRESSED_RGB_S3TC_DXT1_EXT = 0x83F0
var GL_COMPRESSED_RGBA_S3TC_DXT1_EXT = 0x83F1
var GL_COMPRESSED_RGBA_S3TC_DXT3_EXT = 0x83F2
var GL_COMPRESSED_RGBA_S3TC_DXT5_EXT = 0x83F3

var GL_COMPRESSED_RGB_ETC1_WEBGL = 0x8D64

var GL_UNSIGNED_BYTE = 0x1401
// var GL_HALF_FLOAT_OES = 0x8D61
// var GL_FLOAT = 0x1406

var DDSD_MIPMAPCOUNT = 0x20000

var DDSCAPS2_CUBEMAP = 0x200
var DDSCAPS2_CUBEMAP_POSITIVEX = 0x400
var DDSCAPS2_CUBEMAP_NEGATIVEX = 0x800
var DDSCAPS2_CUBEMAP_POSITIVEY = 0x1000
var DDSCAPS2_CUBEMAP_NEGATIVEY = 0x2000
var DDSCAPS2_CUBEMAP_POSITIVEZ = 0x4000
var DDSCAPS2_CUBEMAP_NEGATIVEZ = 0x8000

var CUBEMAP_COMPLETE_FACES = (
  DDSCAPS2_CUBEMAP_POSITIVEX |
  DDSCAPS2_CUBEMAP_NEGATIVEX |
  DDSCAPS2_CUBEMAP_POSITIVEY |
  DDSCAPS2_CUBEMAP_NEGATIVEY |
  DDSCAPS2_CUBEMAP_POSITIVEZ |
  DDSCAPS2_CUBEMAP_NEGATIVEZ)

var DDPF_FOURCC = 0x4
var DDPF_RGB = 0x40

var FOURCC_DXT1 = 0x31545844
var FOURCC_DXT3 = 0x33545844
var FOURCC_DXT5 = 0x35545844
var FOURCC_ETC1 = 0x31435445

// DDS_HEADER {
var OFF_SIZE = 1        // int32 dwSize
var OFF_FLAGS = 2       // int32 dwFlags
var OFF_HEIGHT = 3      // int32 dwHeight
var OFF_WIDTH = 4       // int32 dwWidth
// var OFF_PITCH = 5       // int32 dwPitchOrLinearSize
// var OFF_DEPTH = 6       // int32 dwDepth
var OFF_MIPMAP = 7      // int32 dwMipMapCount; // offset: 7
// int32[11] dwReserved1
// DDS_PIXELFORMAT {
// var OFF_PF_SIZE = 19    // int32 dwSize; // offset: 19
var OFF_PF_FLAGS = 20   // int32 dwFlags
var OFF_FOURCC = 21     // char[4] dwFourCC
// var OFF_RGBA_BITS = 22  // int32 dwRGBBitCount
// var OFF_RED_MASK = 23   // int32 dwRBitMask
// var OFF_GREEN_MASK = 24 // int32 dwGBitMask
// var OFF_BLUE_MASK = 25  // int32 dwBBitMask
// var OFF_ALPHA_MASK = 26 // int32 dwABitMask; // offset: 26
// }
// var OFF_CAPS = 27       // int32 dwCaps; // offset: 27
var OFF_CAPS2 = 28      // int32 dwCaps2
// var OFF_CAPS3 = 29      // int32 dwCaps3
// var OFF_CAPS4 = 30      // int32 dwCaps4
// int32 dwReserved2 // offset 31

function parseDDS (arrayBuffer) {
  var header = new Int32Array(arrayBuffer)
  

  var flags = header[OFF_FLAGS]
  

  var width = header[OFF_WIDTH]
  var height = header[OFF_HEIGHT]

  var type = GL_UNSIGNED_BYTE
  var format = 0
  var blockBytes = 0
  var channels = 4
  switch (header[OFF_FOURCC]) {
    case FOURCC_DXT1:
      blockBytes = 8
      if (flags & DDPF_RGB) {
        channels = 3
        format = GL_COMPRESSED_RGB_S3TC_DXT1_EXT
      } else {
        format = GL_COMPRESSED_RGBA_S3TC_DXT1_EXT
      }
      break

    case FOURCC_DXT3:
      blockBytes = 16
      format = GL_COMPRESSED_RGBA_S3TC_DXT3_EXT
      break

    case FOURCC_DXT5:
      blockBytes = 16
      format = GL_COMPRESSED_RGBA_S3TC_DXT5_EXT
      break

    case FOURCC_ETC1:
      blockBytes = 8
      format = GL_COMPRESSED_RGB_ETC1_WEBGL
      break

    // TODO: Implement hdr and uncompressed textures

    default:
      // Handle uncompressed data here
      
  }

  var pixelFlags = header[OFF_PF_FLAGS]

  var mipmapCount = 1
  if (pixelFlags & DDSD_MIPMAPCOUNT) {
    mipmapCount = Math.max(1, header[OFF_MIPMAP])
  }

  var ptr = header[OFF_SIZE] + 4

  var result = {
    width: width,
    height: height,
    channels: channels,
    format: format,
    type: type,
    compressed: true,
    cube: false,
    pixels: []
  }

  function parseMips (target) {
    var mipWidth = width
    var mipHeight = height

    for (var i = 0; i < mipmapCount; ++i) {
      var size =
        Math.max(1, (mipWidth + 3) >> 2) *
        Math.max(1, (mipHeight + 3) >> 2) *
        blockBytes
      result.pixels.push({
        target: target,
        miplevel: i,
        width: mipWidth,
        height: mipHeight,
        data: new Uint8Array(arrayBuffer, ptr, size)
      })
      ptr += size
      mipWidth >>= 1
      mipHeight >>= 1
    }
  }

  var caps2 = header[OFF_CAPS2]
  var cubemap = !!(caps2 & DDSCAPS2_CUBEMAP)
  if (cubemap) {
    
    result.cube = true
    for (var i = 0; i < 6; ++i) {
      parseMips(GL_TEXTURE_CUBE_MAP_POSITIVE_X + i)
    }
  } else {
    parseMips(GL_TEXTURE_2D)
  }

  return result
}

},{}],22:[function(require,module,exports){
/* globals requestAnimationFrame, cancelAnimationFrame */
if (typeof requestAnimationFrame === 'function' &&
    typeof cancelAnimationFrame === 'function') {
  module.exports = {
    next: function (x) { return requestAnimationFrame(x) },
    cancel: function (x) { return cancelAnimationFrame(x) }
  }
} else {
  module.exports = {
    next: function (cb) {
      setTimeout(cb, 30)
    },
    cancel: clearTimeout
  }
}

},{}],23:[function(require,module,exports){

var isTypedArray = require('./is-typed-array')

var GL_RGBA = 6408
var GL_UNSIGNED_BYTE = 5121
var GL_PACK_ALIGNMENT = 0x0D05

module.exports = function wrapReadPixels (gl, reglPoll, viewportState) {
  function readPixels (input) {
    var options = input || {}
    if (isTypedArray(input)) {
      options = {
        data: options
      }
    } else if (arguments.length === 2) {
      options = {
        width: arguments[0] | 0,
        height: arguments[1] | 0
      }
    } else if (typeof input !== 'object') {
      options = {}
    }

    // Update WebGL state
    reglPoll()

    // Read viewport state
    var x = options.x || 0
    var y = options.y || 0
    var width = options.width || viewportState.width
    var height = options.height || viewportState.height

    // Compute size
    var size = width * height * 4

    // Allocate data
    var data = options.data || new Uint8Array(size)

    // Type check
    
    

    // Run read pixels
    gl.pixelStorei(GL_PACK_ALIGNMENT, 4)
    gl.readPixels(x, y, width, height, GL_RGBA, GL_UNSIGNED_BYTE, data)

    return data
  }

  return readPixels
}

},{"./is-typed-array":18}],24:[function(require,module,exports){

var values = require('./values')

var GL_RENDERBUFFER = 0x8D41

var GL_RGBA4 = 0x8056
var GL_RGB5_A1 = 0x8057
var GL_RGB565 = 0x8D62
var GL_DEPTH_COMPONENT16 = 0x81A5
var GL_STENCIL_INDEX8 = 0x8D48
var GL_DEPTH_STENCIL = 0x84F9

var GL_SRGB8_ALPHA8_EXT = 0x8C43

var GL_RGBA32F_EXT = 0x8814

var GL_RGBA16F_EXT = 0x881A
var GL_RGB16F_EXT = 0x881B

module.exports = function (gl, extensions, limits) {
  var formatTypes = {
    'rgba4': GL_RGBA4,
    'rgb565': GL_RGB565,
    'rgb5 a1': GL_RGB5_A1,
    'depth': GL_DEPTH_COMPONENT16,
    'stencil': GL_STENCIL_INDEX8,
    'depth stencil': GL_DEPTH_STENCIL
  }

  if (extensions.ext_srgb) {
    formatTypes['srgba'] = GL_SRGB8_ALPHA8_EXT
  }

  if (extensions.ext_color_buffer_half_float) {
    formatTypes['rgba16f'] = GL_RGBA16F_EXT
    formatTypes['rgb16f'] = GL_RGB16F_EXT
  }

  if (extensions.webgl_color_buffer_float) {
    formatTypes['rgba32f'] = GL_RGBA32F_EXT
  }

  var renderbufferCount = 0
  var renderbufferSet = {}

  function REGLRenderbuffer () {
    this.id = renderbufferCount++
    this.refCount = 1

    this.renderbuffer = null

    this.format = GL_RGBA4
    this.width = 0
    this.height = 0
  }

  REGLRenderbuffer.prototype.decRef = function () {
    if (--this.refCount === 0) {
      destroy(this)
    }
  }

  function refresh (rb) {
    if (!gl.isRenderbuffer(rb.renderbuffer)) {
      rb.renderbuffer = gl.createRenderbuffer()
    }
    gl.bindRenderbuffer(GL_RENDERBUFFER, rb.renderbuffer)
    gl.renderbufferStorage(
      GL_RENDERBUFFER,
      rb.format,
      rb.width,
      rb.height)
  }

  function destroy (rb) {
    var handle = rb.renderbuffer
    
    gl.bindRenderbuffer(GL_RENDERBUFFER, null)
    if (gl.isRenderbuffer(handle)) {
      gl.deleteRenderbuffer(handle)
    }
    rb.renderbuffer = null
    rb.refCount = 0
    delete renderbufferSet[rb.id]
  }

  function createRenderbuffer (input) {
    var renderbuffer = new REGLRenderbuffer()
    renderbufferSet[renderbuffer.id] = renderbuffer

    function reglRenderbuffer (input) {
      var options = input || {}

      var w = 0
      var h = 0
      if ('shape' in options) {
        var shape = options.shape
        
        w = shape[0] | 0
        h = shape[1] | 0
      } else {
        if ('radius' in options) {
          w = h = options.radius | 0
        }
        if ('width' in options) {
          w = options.width | 0
        }
        if ('height' in options) {
          h = options.height | 0
        }
      }
      var s = limits.maxRenderbufferSize
      
      reglRenderbuffer.width = renderbuffer.width = Math.max(w, 1)
      reglRenderbuffer.height = renderbuffer.height = Math.max(h, 1)

      renderbuffer.format = GL_RGBA4
      if ('format' in options) {
        var format = options.format
        
        renderbuffer.format = formatTypes[format]
      }

      refresh(renderbuffer)

      return reglRenderbuffer
    }

    reglRenderbuffer(input)

    reglRenderbuffer._reglType = 'renderbuffer'
    reglRenderbuffer._renderbuffer = renderbuffer
    reglRenderbuffer.destroy = function () {
      renderbuffer.decRef()
    }

    return reglRenderbuffer
  }

  function refreshRenderbuffers () {
    values(renderbufferSet).forEach(refresh)
  }

  function destroyRenderbuffers () {
    values(renderbufferSet).forEach(destroy)
  }

  return {
    create: createRenderbuffer,
    refresh: refreshRenderbuffers,
    clear: destroyRenderbuffers
  }
}

},{"./values":32}],25:[function(require,module,exports){

var values = require('./values')

var DEFAULT_FRAG_SHADER = 'void main(){gl_FragColor=vec4(0,0,0,0);}'
var DEFAULT_VERT_SHADER = 'void main(){gl_Position=vec4(0,0,0,0);}'

var GL_FRAGMENT_SHADER = 35632
var GL_VERTEX_SHADER = 35633

var GL_ACTIVE_UNIFORMS = 0x8B86
var GL_ACTIVE_ATTRIBUTES = 0x8B89

function ActiveInfo (name, location, info) {
  this.name = name
  this.location = location
  this.info = info
}

module.exports = function wrapShaderState (
  gl,
  attributeState,
  uniformState,
  compileShaderDraw,
  stringStore) {
  // ===================================================
  // glsl compilation and linking
  // ===================================================
  var fragShaders = {}
  var vertShaders = {}

  function getShader (type, id) {
    var cache = type === GL_FRAGMENT_SHADER ? fragShaders : vertShaders
    var shader = cache[id]

    if (!shader) {
      var source = stringStore.str(id)
      shader = gl.createShader(type)
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      
      cache[id] = shader
    }

    return shader
  }

  // ===================================================
  // program linking
  // ===================================================
  var programCache = {}
  var programList = []

  function REGLProgram (fragId, vertId) {
    this.fragId = fragId
    this.vertId = vertId
    this.program = null
    this.uniforms = []
    this.attributes = []
    this.draw = function () {}
    this.batchCache = {}
  }

  function linkProgram (desc) {
    var i, info

    // -------------------------------
    // compile & link
    // -------------------------------
    var fragShader = getShader(GL_FRAGMENT_SHADER, desc.fragId)
    var vertShader = getShader(GL_VERTEX_SHADER, desc.vertId)

    var program = desc.program = gl.createProgram()
    gl.attachShader(program, fragShader)
    gl.attachShader(program, vertShader)
    gl.linkProgram(program)
    

    // -------------------------------
    // grab uniforms
    // -------------------------------
    var numUniforms = gl.getProgramParameter(program, GL_ACTIVE_UNIFORMS)
    var uniforms = desc.uniforms = []

    for (i = 0; i < numUniforms; ++i) {
      info = gl.getActiveUniform(program, i)
      if (info) {
        if (info.size > 1) {
          for (var j = 0; j < info.size; ++j) {
            var name = info.name.replace('[0]', '[' + j + ']')
            uniformState.def(name)
            uniforms.push(new ActiveInfo(
              name,
              gl.getUniformLocation(program, name),
              info))
          }
        } else {
          uniformState.def(info.name)
          uniforms.push(new ActiveInfo(
            info.name,
            gl.getUniformLocation(program, info.name),
            info))
        }
      }
    }

    // -------------------------------
    // grab attributes
    // -------------------------------
    var numAttributes = gl.getProgramParameter(program, GL_ACTIVE_ATTRIBUTES)
    var attributes = desc.attributes = []
    for (i = 0; i < numAttributes; ++i) {
      info = gl.getActiveAttrib(program, i)
      if (info) {
        attributeState.def(info.name)
        attributes.push(new ActiveInfo(
          info.name,
          gl.getAttribLocation(program, info.name),
          info))
      }
    }

    // -------------------------------
    // clear cached rendering methods
    // -------------------------------
    desc.draw = compileShaderDraw(desc)
    desc.batchCache = {}
  }

  function getProgram (vertId, fragId) {
    var cache = programCache[fragId]
    if (!cache) {
      cache = programCache[fragId] = {}
    }
    var program = cache[vertId]
    if (!program) {
      program = new REGLProgram(fragId, vertId)
      linkProgram(program)
      cache[vertId] = program
      programList.push(program)
    }
    return program
  }

  return {
    create: getProgram,

    clear: function () {
      var deleteShader = gl.deleteShader.bind(gl)
      values(fragShaders).forEach(deleteShader)
      fragShaders = {}
      values(vertShaders).forEach(deleteShader)
      vertShaders = {}

      programList.forEach(function (desc) {
        gl.deleteProgram(desc.program)
      })
      programList.length = 0
      programCache = {}
    },

    refresh: function () {
      fragShaders = {}
      vertShaders = {}
      programList.forEach(linkProgram)
    },

    programs: [ null ],
    fragShaders: [ stringStore.id(DEFAULT_FRAG_SHADER) ],
    vertShaders: [ stringStore.id(DEFAULT_VERT_SHADER) ]
  }
}

},{"./values":32}],26:[function(require,module,exports){
// A stack for managing the state of a scalar/vector parameter

module.exports = function createStack (init, onChange) {
  var n = init.length
  var stack = init.slice()
  var current = init.slice()
  var dirty = false
  var forceDirty = true

  function poll () {
    var ptr = stack.length - n
    if (dirty || forceDirty) {
      switch (n) {
        case 1:
          onChange(stack[ptr])
          break
        case 2:
          onChange(stack[ptr], stack[ptr + 1])
          break
        case 3:
          onChange(stack[ptr], stack[ptr + 1], stack[ptr + 2])
          break
        case 4:
          onChange(stack[ptr], stack[ptr + 1], stack[ptr + 2], stack[ptr + 3])
          break
        case 5:
          onChange(stack[ptr], stack[ptr + 1], stack[ptr + 2], stack[ptr + 3], stack[ptr + 4])
          break
        case 6:
          onChange(stack[ptr], stack[ptr + 1], stack[ptr + 2], stack[ptr + 3], stack[ptr + 4], stack[ptr + 5])
          break
        default:
          onChange.apply(null, stack.slice(ptr, stack.length))
      }
      for (var i = 0; i < n; ++i) {
        current[i] = stack[ptr + i]
      }
      forceDirty = dirty = false
    }
  }

  return {
    push: function () {
      dirty = false
      for (var i = 0; i < n; ++i) {
        var x = arguments[i]
        dirty = dirty || (x !== current[i])
        stack.push(x)
      }
    },

    pop: function () {
      dirty = false
      stack.length -= n
      for (var i = 0; i < n; ++i) {
        dirty = dirty || (stack[stack.length - n + i] !== current[i])
      }
    },

    poll: poll,

    setDirty: function () {
      forceDirty = true
    }
  }
}

},{}],27:[function(require,module,exports){
var createStack = require('./stack')
var createEnvironment = require('./codegen')

// WebGL constants
var GL_CULL_FACE = 0x0B44
var GL_BLEND = 0x0BE2
var GL_DITHER = 0x0BD0
var GL_STENCIL_TEST = 0x0B90
var GL_DEPTH_TEST = 0x0B71
var GL_SCISSOR_TEST = 0x0C11
var GL_POLYGON_OFFSET_FILL = 0x8037
var GL_SAMPLE_ALPHA_TO_COVERAGE = 0x809E
var GL_SAMPLE_COVERAGE = 0x80A0
var GL_FUNC_ADD = 0x8006
var GL_ZERO = 0
var GL_ONE = 1
var GL_FRONT = 1028
var GL_BACK = 1029
var GL_LESS = 513
var GL_CCW = 2305
var GL_ALWAYS = 519
var GL_KEEP = 7680

module.exports = function wrapContextState (gl, framebufferState, viewportState) {
  function capStack (cap, dflt) {
    var result = createStack([!!dflt], function (flag) {
      if (flag) {
        gl.enable(cap)
      } else {
        gl.disable(cap)
      }
    })
    result.flag = cap
    return result
  }

  // Caps, flags and other random WebGL context state
  var contextState = {
    // Dithering
    'dither': capStack(GL_DITHER),

    // Blending
    'blend.enable': capStack(GL_BLEND),
    'blend.color': createStack([0, 0, 0, 0], function (r, g, b, a) {
      gl.blendColor(r, g, b, a)
    }),
    'blend.equation': createStack([GL_FUNC_ADD, GL_FUNC_ADD], function (rgb, a) {
      gl.blendEquationSeparate(rgb, a)
    }),
    'blend.func': createStack([
      GL_ONE, GL_ZERO, GL_ONE, GL_ZERO
    ], function (srcRGB, dstRGB, srcAlpha, dstAlpha) {
      gl.blendFuncSeparate(srcRGB, dstRGB, srcAlpha, dstAlpha)
    }),

    // Depth
    'depth.enable': capStack(GL_DEPTH_TEST, true),
    'depth.func': createStack([GL_LESS], function (func) {
      gl.depthFunc(func)
    }),
    'depth.range': createStack([0, 1], function (near, far) {
      gl.depthRange(near, far)
    }),
    'depth.mask': createStack([true], function (m) {
      gl.depthMask(m)
    }),

    // Face culling
    'cull.enable': capStack(GL_CULL_FACE),
    'cull.face': createStack([GL_BACK], function (mode) {
      gl.cullFace(mode)
    }),

    // Front face orientation
    'frontFace': createStack([GL_CCW], function (mode) {
      gl.frontFace(mode)
    }),

    // Write masks
    'colorMask': createStack([true, true, true, true], function (r, g, b, a) {
      gl.colorMask(r, g, b, a)
    }),

    // Line width
    'lineWidth': createStack([1], function (w) {
      gl.lineWidth(w)
    }),

    // Polygon offset
    'polygonOffset.enable': capStack(GL_POLYGON_OFFSET_FILL),
    'polygonOffset.offset': createStack([0, 0], function (factor, units) {
      gl.polygonOffset(factor, units)
    }),

    // Sample coverage
    'sample.alpha': capStack(GL_SAMPLE_ALPHA_TO_COVERAGE),
    'sample.enable': capStack(GL_SAMPLE_COVERAGE),
    'sample.coverage': createStack([1, false], function (value, invert) {
      gl.sampleCoverage(value, invert)
    }),

    // Stencil
    'stencil.enable': capStack(GL_STENCIL_TEST),
    'stencil.mask': createStack([-1], function (mask) {
      gl.stencilMask(mask)
    }),
    'stencil.func': createStack([
      GL_ALWAYS, 0, -1
    ], function (func, ref, mask) {
      gl.stencilFunc(func, ref, mask)
    }),
    'stencil.opFront': createStack([
      GL_KEEP, GL_KEEP, GL_KEEP
    ], function (fail, zfail, pass) {
      gl.stencilOpSeparate(GL_FRONT, fail, zfail, pass)
    }),
    'stencil.opBack': createStack([
      GL_KEEP, GL_KEEP, GL_KEEP
    ], function (fail, zfail, pass) {
      gl.stencilOpSeparate(GL_BACK, fail, zfail, pass)
    }),

    // Scissor
    'scissor.enable': capStack(GL_SCISSOR_TEST),
    'scissor.box': createStack([0, 0, -1, -1], function (x, y, w, h) {
      var w_ = w
      var fbo = framebufferState.top()
      if (w < 0) {
        if (fbo) {
          w_ = fbo.width - x
        } else {
          w_ = gl.drawingBufferWidth - x
        }
      }
      var h_ = h
      if (h < 0) {
        if (fbo) {
          h_ = fbo.height - y
        } else {
          h_ = gl.drawingBufferHeight - y
        }
      }
      gl.scissor(x, y, w_, h_)
    }),

    // Viewport
    'viewport': createStack([0, 0, -1, -1], function (x, y, w, h) {
      var w_ = w
      var fbo = framebufferState.top()
      if (w < 0) {
        if (fbo) {
          w_ = fbo.width - x
        } else {
          w_ = gl.drawingBufferWidth - x
        }
      }
      var h_ = h
      if (h < 0) {
        if (fbo) {
          h_ = fbo.height - y
        } else {
          h_ = gl.drawingBufferHeight - y
        }
      }
      gl.viewport(x, y, w_, h_)
      viewportState.width = w_
      viewportState.height = h_
    })
  }

  var env = createEnvironment()
  var poll = env.proc('poll')
  var refresh = env.proc('refresh')
  Object.keys(contextState).forEach(function (prop) {
    var STACK = env.link(contextState[prop])
    poll(STACK, '.poll();')
    refresh(STACK, '.setDirty();')
  })

  var procs = env.compile()

  return {
    contextState: contextState,
    viewport: viewportState,
    poll: procs.poll,
    refresh: procs.refresh,

    notifyViewportChanged: function () {
      contextState.viewport.setDirty()
      contextState['scissor.box'].setDirty()
    }
  }
}

},{"./codegen":5,"./stack":26}],28:[function(require,module,exports){
module.exports = function createStringStore() {
  var stringIds = {}
  var stringValues = ['']
  return {
    id: function (str) {
      var result = stringIds[str]
      if (result) {
        return result
      }
      result = stringIds[str] = stringValues.length
      stringValues.push(str)
      return result
    },

    str: function (id) {
      return stringValues[id]
    }
  }
}

},{}],29:[function(require,module,exports){

var extend = require('./extend')
var values = require('./values')
var isTypedArray = require('./is-typed-array')
var isNDArrayLike = require('./is-ndarray')
var loadTexture = require('./load-texture')
var convertToHalfFloat = require('./to-half-float')
var parseDDS = require('./parse-dds')

var GL_COMPRESSED_TEXTURE_FORMATS = 0x86A3

var GL_TEXTURE_2D = 0x0DE1
var GL_TEXTURE_CUBE_MAP = 0x8513
var GL_TEXTURE_CUBE_MAP_POSITIVE_X = 0x8515

var GL_RGBA = 0x1908
var GL_ALPHA = 0x1906
var GL_RGB = 0x1907
var GL_LUMINANCE = 0x1909
var GL_LUMINANCE_ALPHA = 0x190A

var GL_RGBA4 = 0x8056
var GL_RGB5_A1 = 0x8057
var GL_RGB565 = 0x8D62

var GL_UNSIGNED_SHORT_4_4_4_4 = 0x8033
var GL_UNSIGNED_SHORT_5_5_5_1 = 0x8034
var GL_UNSIGNED_SHORT_5_6_5 = 0x8363
var GL_UNSIGNED_INT_24_8_WEBGL = 0x84FA

var GL_DEPTH_COMPONENT = 0x1902
var GL_DEPTH_STENCIL = 0x84F9

var GL_SRGB_EXT = 0x8C40
var GL_SRGB_ALPHA_EXT = 0x8C42

var GL_HALF_FLOAT_OES = 0x8D61

var GL_COMPRESSED_RGB_S3TC_DXT1_EXT = 0x83F0
var GL_COMPRESSED_RGBA_S3TC_DXT1_EXT = 0x83F1
var GL_COMPRESSED_RGBA_S3TC_DXT3_EXT = 0x83F2
var GL_COMPRESSED_RGBA_S3TC_DXT5_EXT = 0x83F3

var GL_COMPRESSED_RGB_ATC_WEBGL = 0x8C92
var GL_COMPRESSED_RGBA_ATC_EXPLICIT_ALPHA_WEBGL = 0x8C93
var GL_COMPRESSED_RGBA_ATC_INTERPOLATED_ALPHA_WEBGL = 0x87EE

var GL_COMPRESSED_RGB_PVRTC_4BPPV1_IMG = 0x8C00
var GL_COMPRESSED_RGB_PVRTC_2BPPV1_IMG = 0x8C01
var GL_COMPRESSED_RGBA_PVRTC_4BPPV1_IMG = 0x8C02
var GL_COMPRESSED_RGBA_PVRTC_2BPPV1_IMG = 0x8C03

var GL_COMPRESSED_RGB_ETC1_WEBGL = 0x8D64

var GL_UNSIGNED_BYTE = 0x1401
var GL_UNSIGNED_SHORT = 0x1403
var GL_UNSIGNED_INT = 0x1405
var GL_FLOAT = 0x1406

var GL_TEXTURE_WRAP_S = 0x2802
var GL_TEXTURE_WRAP_T = 0x2803

var GL_REPEAT = 0x2901
var GL_CLAMP_TO_EDGE = 0x812F
var GL_MIRRORED_REPEAT = 0x8370

var GL_TEXTURE_MAG_FILTER = 0x2800
var GL_TEXTURE_MIN_FILTER = 0x2801

var GL_NEAREST = 0x2600
var GL_LINEAR = 0x2601
var GL_NEAREST_MIPMAP_NEAREST = 0x2700
var GL_LINEAR_MIPMAP_NEAREST = 0x2701
var GL_NEAREST_MIPMAP_LINEAR = 0x2702
var GL_LINEAR_MIPMAP_LINEAR = 0x2703

var GL_GENERATE_MIPMAP_HINT = 0x8192
var GL_DONT_CARE = 0x1100
var GL_FASTEST = 0x1101
var GL_NICEST = 0x1102

var GL_TEXTURE_MAX_ANISOTROPY_EXT = 0x84FE

var GL_UNPACK_ALIGNMENT = 0x0CF5
var GL_UNPACK_FLIP_Y_WEBGL = 0x9240
var GL_UNPACK_PREMULTIPLY_ALPHA_WEBGL = 0x9241
var GL_UNPACK_COLORSPACE_CONVERSION_WEBGL = 0x9243

var GL_BROWSER_DEFAULT_WEBGL = 0x9244

var GL_TEXTURE0 = 0x84C0

var MIPMAP_FILTERS = [
  GL_NEAREST_MIPMAP_NEAREST,
  GL_NEAREST_MIPMAP_LINEAR,
  GL_LINEAR_MIPMAP_NEAREST,
  GL_LINEAR_MIPMAP_LINEAR
]

function isPow2 (v) {
  return !(v & (v - 1)) && (!!v)
}

function isNumericArray (arr) {
  return (
    Array.isArray(arr) &&
    (arr.length === 0 ||
    typeof arr[0] === 'number'))
}

function isRectArray (arr) {
  if (!Array.isArray(arr)) {
    return false
  }

  var width = arr.length
  if (width === 0 || !Array.isArray(arr[0])) {
    return false
  }

  var height = arr[0].length
  for (var i = 1; i < width; ++i) {
    if (!Array.isArray(arr[i]) || arr[i].length !== height) {
      return false
    }
  }
  return true
}

function classString (x) {
  return Object.prototype.toString.call(x)
}

function isCanvasElement (object) {
  return classString(object) === '[object HTMLCanvasElement]'
}

function isContext2D (object) {
  return classString(object) === '[object CanvasRenderingContext2D]'
}

function isImageElement (object) {
  return classString(object) === '[object HTMLImageElement]'
}

function isVideoElement (object) {
  return classString(object) === '[object HTMLVideoElement]'
}

function isPendingXHR (object) {
  return classString(object) === '[object XMLHttpRequest]'
}

function isPixelData (object) {
  return (
    typeof object === 'string' ||
    (!!object && (
      isTypedArray(object) ||
      isNumericArray(object) ||
      isNDArrayLike(object) ||
      isCanvasElement(object) ||
      isContext2D(object) ||
      isImageElement(object) ||
      isVideoElement(object) ||
      isRectArray(object))))
}

// Transpose an array of pixels
function transposePixels (data, nx, ny, nc, sx, sy, sc, off) {
  var result = new data.constructor(nx * ny * nc)
  var ptr = 0
  for (var i = 0; i < ny; ++i) {
    for (var j = 0; j < nx; ++j) {
      for (var k = 0; k < nc; ++k) {
        result[ptr++] = data[sy * i + sx * j + sc * k + off]
      }
    }
  }
  return result
}

module.exports = function createTextureSet (gl, extensions, limits, reglPoll, viewportState) {
  var mipmapHint = {
    "don't care": GL_DONT_CARE,
    'dont care': GL_DONT_CARE,
    'nice': GL_NICEST,
    'fast': GL_FASTEST
  }

  var wrapModes = {
    'repeat': GL_REPEAT,
    'clamp': GL_CLAMP_TO_EDGE,
    'mirror': GL_MIRRORED_REPEAT
  }

  var magFilters = {
    'nearest': GL_NEAREST,
    'linear': GL_LINEAR
  }

  var minFilters = extend({
    'nearest mipmap nearest': GL_NEAREST_MIPMAP_NEAREST,
    'linear mipmap nearest': GL_LINEAR_MIPMAP_NEAREST,
    'nearest mipmap linear': GL_NEAREST_MIPMAP_LINEAR,
    'linear mipmap linear': GL_LINEAR_MIPMAP_LINEAR,
    'mipmap': GL_LINEAR_MIPMAP_LINEAR
  }, magFilters)

  var colorSpace = {
    'none': 0,
    'browser': GL_BROWSER_DEFAULT_WEBGL
  }

  var textureTypes = {
    'uint8': GL_UNSIGNED_BYTE,
    'rgba4': GL_UNSIGNED_SHORT_4_4_4_4,
    'rgb565': GL_UNSIGNED_SHORT_5_6_5,
    'rgb5 a1': GL_UNSIGNED_SHORT_5_5_5_1
  }

  var textureFormats = {
    'alpha': GL_ALPHA,
    'luminance': GL_LUMINANCE,
    'luminance alpha': GL_LUMINANCE_ALPHA,
    'rgb': GL_RGB,
    'rgba': GL_RGBA,
    'rgba4': GL_RGBA4,
    'rgb5 a1': GL_RGB5_A1,
    'rgb565': GL_RGB565
  }

  var compressedTextureFormats = {}

  if (extensions.ext_srgb) {
    textureFormats.srgb = GL_SRGB_EXT
    textureFormats.srgba = GL_SRGB_ALPHA_EXT
  }

  if (extensions.oes_texture_float) {
    textureTypes.float = GL_FLOAT
  }

  if (extensions.oes_texture_half_float) {
    textureTypes['half float'] = GL_HALF_FLOAT_OES
  }

  if (extensions.webgl_depth_texture) {
    extend(textureFormats, {
      'depth': GL_DEPTH_COMPONENT,
      'depth stencil': GL_DEPTH_STENCIL
    })

    extend(textureTypes, {
      'uint16': GL_UNSIGNED_SHORT,
      'uint32': GL_UNSIGNED_INT,
      'depth stencil': GL_UNSIGNED_INT_24_8_WEBGL
    })
  }

  if (extensions.webgl_compressed_texture_s3tc) {
    extend(compressedTextureFormats, {
      'rgb s3tc dxt1': GL_COMPRESSED_RGB_S3TC_DXT1_EXT,
      'rgba s3tc dxt1': GL_COMPRESSED_RGBA_S3TC_DXT1_EXT,
      'rgba s3tc dxt3': GL_COMPRESSED_RGBA_S3TC_DXT3_EXT,
      'rgba s3tc dxt5': GL_COMPRESSED_RGBA_S3TC_DXT5_EXT
    })
  }

  if (extensions.webgl_compressed_texture_atc) {
    extend(compressedTextureFormats, {
      'rgb arc': GL_COMPRESSED_RGB_ATC_WEBGL,
      'rgba atc explicit alpha': GL_COMPRESSED_RGBA_ATC_EXPLICIT_ALPHA_WEBGL,
      'rgba atc interpolated alpha': GL_COMPRESSED_RGBA_ATC_INTERPOLATED_ALPHA_WEBGL
    })
  }

  if (extensions.webgl_compressed_texture_pvrtc) {
    extend(compressedTextureFormats, {
      'rgb pvrtc 4bppv1': GL_COMPRESSED_RGB_PVRTC_4BPPV1_IMG,
      'rgb pvrtc 2bppv1': GL_COMPRESSED_RGB_PVRTC_2BPPV1_IMG,
      'rgba pvrtc 4bppv1': GL_COMPRESSED_RGBA_PVRTC_4BPPV1_IMG,
      'rgba pvrtc 2bppv1': GL_COMPRESSED_RGBA_PVRTC_2BPPV1_IMG
    })
  }

  if (extensions.webgl_compressed_texture_etc1) {
    compressedTextureFormats['rgb etc1'] = GL_COMPRESSED_RGB_ETC1_WEBGL
  }

  // Copy over all texture formats
  var supportedCompressedFormats = Array.prototype.slice.call(
    gl.getParameter(GL_COMPRESSED_TEXTURE_FORMATS))
  Object.keys(compressedTextureFormats).forEach(function (name) {
    var format = compressedTextureFormats[name]
    if (supportedCompressedFormats.indexOf(format) >= 0) {
      textureFormats[name] = format
    }
  })

  var supportedFormats = Object.keys(textureFormats)
  limits.textureFormats = supportedFormats

  var colorFormats = supportedFormats.reduce(function (color, key) {
    var glenum = textureFormats[key]
    if (glenum === GL_LUMINANCE ||
        glenum === GL_ALPHA ||
        glenum === GL_LUMINANCE ||
        glenum === GL_LUMINANCE_ALPHA ||
        glenum === GL_DEPTH_COMPONENT ||
        glenum === GL_DEPTH_STENCIL) {
      color[glenum] = glenum
    } else if (glenum === GL_RGB5_A1 || key.indexOf('rgba') >= 0) {
      color[glenum] = GL_RGBA
    } else {
      color[glenum] = GL_RGB
    }
    return color
  }, {})

  // Pixel storage parsing
  function PixelInfo (target) {
    // tex target
    this.target = target

    // pixelStorei info
    this.flipY = false
    this.premultiplyAlpha = false
    this.unpackAlignment = 1
    this.colorSpace = 0

    // shape
    this.width = 0
    this.height = 0
    this.channels = 0

    // format and type
    this.format = 0
    this.internalformat = 0
    this.type = 0
    this.compressed = false

    // mip level
    this.miplevel = 0

    // ndarray-like parameters
    this.strideX = 0
    this.strideY = 0
    this.strideC = 0
    this.offset = 0

    // copy pixels info
    this.x = 0
    this.y = 0
    this.copy = false

    // data sources
    this.data = null
    this.image = null
    this.video = null
    this.canvas = null
    this.xhr = null

    // CORS
    this.crossOrigin = null

    // horrible state flags
    this.needsPoll = false
    this.needsListeners = false
  }

  extend(PixelInfo.prototype, {
    parseFlags: function (options) {
      if (typeof options !== 'object' || !options) {
        return
      }

      if ('premultiplyAlpha' in options) {
        
        this.premultiplyAlpha = options.premultiplyAlpha
      }

      if ('flipY' in options) {
        
        this.flipY = options.flipY
      }

      if ('alignment' in options) {
        
        this.unpackAlignment = options.alignment
      }

      if ('colorSpace' in options) {
        
        this.colorSpace = colorSpace[options.colorSpace]
      }

      if ('format' in options) {
        var format = options.format
        
        this.internalformat = textureFormats[format]
        if (format in textureTypes) {
          this.type = textureTypes[format]
        }
        if (format in compressedTextureFormats) {
          this.compressed = true
        }
      }

      if ('type' in options) {
        var type = options.type
        
        this.type = textureTypes[type]
      }

      var w = this.width
      var h = this.height
      var c = this.channels
      if ('shape' in options) {
        
        w = options.shape[0]
        h = options.shape[1]
        if (options.shape.length === 3) {
          c = options.shape[2]
        }
      } else {
        if ('radius' in options) {
          w = h = options.radius
        }
        if ('width' in options) {
          w = options.width
        }
        if ('height' in options) {
          h = options.height
        }
        if ('channels' in options) {
          c = options.channels
        }
      }
      this.width = w | 0
      this.height = h | 0
      this.channels = c | 0

      if ('stride' in options) {
        var stride = options.stride
        
        this.strideX = stride[0]
        this.strideY = stride[1]
        if (stride.length === 3) {
          this.strideC = stride[2]
        } else {
          this.strideC = 1
        }
        this.needsTranspose = true
      } else {
        this.strideC = 1
        this.strideX = this.strideC * c
        this.strideY = this.strideX * w
      }

      if ('offset' in options) {
        this.offset = options.offset | 0
        this.needsTranspose = true
      }

      if ('crossOrigin' in options) {
        this.crossOrigin = options.crossOrigin
      }
    },
    parse: function (options, miplevel) {
      this.miplevel = miplevel
      this.width = this.width >> miplevel
      this.height = this.height >> miplevel

      var data = options
      switch (typeof options) {
        case 'string':
          break
        case 'object':
          if (!options) {
            return
          }
          this.parseFlags(options)
          if (isPixelData(options.data)) {
            data = options.data
          }
          break
        case 'undefined':
          return
        default:
          
      }

      if (typeof data === 'string') {
        data = loadTexture(data, this.crossOrigin)
      }

      var array = null
      var needsConvert = false

      if (this.compressed) {
        
      }

      if (data === null) {
        // TODO
      } else if (isTypedArray(data)) {
        this.data = data
      } else if (isNumericArray(data)) {
        array = data
        needsConvert = true
      } else if (isNDArrayLike(data)) {
        if (Array.isArray(data.data)) {
          array = data.data
          needsConvert = true
        } else {
          this.data = data.data
        }
        var shape = data.shape
        this.width = shape[0]
        this.height = shape[1]
        if (shape.length === 3) {
          this.channels = shape[2]
        } else {
          this.channels = 1
        }
        var stride = data.stride
        this.strideX = data.stride[0]
        this.strideY = data.stride[1]
        if (stride.length === 3) {
          this.strideC = data.stride[2]
        } else {
          this.strideC = 1
        }
        this.offset = data.offset
        this.needsTranspose = true
      } else if (isCanvasElement(data) || isContext2D(data)) {
        if (isCanvasElement(data)) {
          this.canvas = data
        } else {
          this.canvas = data.canvas
        }
        this.width = this.canvas.width
        this.height = this.canvas.height
        this.setDefaultFormat()
      } else if (isImageElement(data)) {
        this.image = data
        if (!data.complete) {
          this.width = this.width || data.naturalWidth
          this.height = this.height || data.naturalHeight
          this.needsListeners = true
        } else {
          this.width = data.naturalWidth
          this.height = data.naturalHeight
        }
        this.setDefaultFormat()
      } else if (isVideoElement(data)) {
        this.video = data
        if (data.readyState > 1) {
          this.width = data.width
          this.height = data.height
        } else {
          this.width = this.width || data.width
          this.height = this.height || data.height
          this.needsListeners = true
        }
        this.needsPoll = true
        this.setDefaultFormat()
      } else if (isPendingXHR(data)) {
        this.xhr = data
        this.needsListeners = true
      } else if (isRectArray(data)) {
        var w = data.length
        var h = data[0].length
        var c = 1
        var i, j, k, p
        if (Array.isArray(data[0][0])) {
          c = data[0][0].length
          
          array = Array(w * h * c)
          p = 0
          for (j = 0; j < h; ++j) {
            for (i = 0; i < w; ++i) {
              for (k = 0; k < c; ++k) {
                array[p++] = data[i][j][k]
              }
            }
          }
        } else {
          array = Array(w * h)
          p = 0
          for (j = 0; j < h; ++j) {
            for (i = 0; i < w; ++i) {
              array[p++] = data[i][j]
            }
          }
        }
        this.width = w
        this.height = h
        this.channels = c
        needsConvert = true
      } else if (options.copy) {
        this.copy = true
        this.x = this.x | 0
        this.y = this.y | 0
        this.width = (this.width || viewportState.width) | 0
        this.height = (this.height || viewportState.height) | 0
        this.setDefaultFormat()
      }

      // Fix up missing type info for typed arrays
      if (!this.type && this.data) {
        if (this.format === GL_DEPTH_COMPONENT) {
          if (this.data instanceof Uint16Array) {
            this.type = GL_UNSIGNED_SHORT
          } else if (this.data instanceof Uint32Array) {
            this.type = GL_UNSIGNED_INT
          }
        } else if (this.data instanceof Float32Array) {
          this.type = GL_FLOAT
        }
      }

      // Infer default format
      if (!this.internalformat) {
        var channels = this.channels = this.channels || 4
        this.internalformat = [
          GL_LUMINANCE,
          GL_LUMINANCE_ALPHA,
          GL_RGB,
          GL_RGBA][channels - 1]
        
      }

      var format = this.internalformat
      if (format === GL_DEPTH_COMPONENT || format === GL_DEPTH_STENCIL) {
        
        if (format === GL_DEPTH_COMPONENT) {
          
        }
        if (format === GL_DEPTH_STENCIL) {
          
        }
        
      }

      // Compute color format and number of channels
      var colorFormat = this.format = colorFormats[format]
      if (!this.channels) {
        switch (colorFormat) {
          case GL_LUMINANCE:
          case GL_ALPHA:
          case GL_DEPTH_COMPONENT:
            this.channels = 1
            break

          case GL_DEPTH_STENCIL:
          case GL_LUMINANCE_ALPHA:
            this.channels = 2
            break

          case GL_RGB:
            this.channels = 3
            break

          default:
            this.channels = 4
        }
      }

      // Check that texture type is supported
      var type = this.type
      if (type === GL_FLOAT) {
        
      } else if (type === GL_HALF_FLOAT_OES) {
        
      } else if (!type) {
        if (format === GL_DEPTH_COMPONENT) {
          type = GL_UNSIGNED_INT
        } else {
          type = GL_UNSIGNED_BYTE
        }
      }
      this.type = type

      // apply conversion
      if (needsConvert) {
        switch (type) {
          case GL_UNSIGNED_BYTE:
            this.data = new Uint8Array(array)
            break
          case GL_UNSIGNED_SHORT:
            this.data = new Uint16Array(array)
            break
          case GL_UNSIGNED_INT:
            this.data = new Uint32Array(array)
            break
          case GL_FLOAT:
            this.data = new Float32Array(array)
            break
          case GL_HALF_FLOAT_OES:
            this.data = convertToHalfFloat(array)
            break

          case GL_UNSIGNED_SHORT_5_6_5:
          case GL_UNSIGNED_SHORT_5_5_5_1:
          case GL_UNSIGNED_SHORT_4_4_4_4:
          case GL_UNSIGNED_INT_24_8_WEBGL:
            
            break

          default:
            
        }
      }

      if (this.data) {
        // apply transpose
        if (this.needsTranspose) {
          this.data = transposePixels(
            this.data,
            this.width,
            this.height,
            this.channels,
            this.strideX,
            this.strideY,
            this.strideC,
            this.offset)
        }
        // check data type
        switch (type) {
          case GL_UNSIGNED_BYTE:
            
            break
          case GL_UNSIGNED_SHORT_5_6_5:
          case GL_UNSIGNED_SHORT_5_5_5_1:
          case GL_UNSIGNED_SHORT_4_4_4_4:
          case GL_UNSIGNED_SHORT:
          case GL_HALF_FLOAT_OES:
            
            break
          case GL_UNSIGNED_INT:
            
            break

          case GL_FLOAT:
            
            break

          default:
            
        }
      }

      this.needsTranspose = false
    },

    setDefaultFormat: function () {
      this.format = this.internalformat = GL_RGBA
      this.type = GL_UNSIGNED_BYTE
      this.channels = 4
      this.compressed = false
    },

    upload: function (params) {
      gl.pixelStorei(GL_UNPACK_FLIP_Y_WEBGL, this.flipY)
      gl.pixelStorei(GL_UNPACK_PREMULTIPLY_ALPHA_WEBGL, this.premultiplyAlpha)
      gl.pixelStorei(GL_UNPACK_COLORSPACE_CONVERSION_WEBGL, this.colorSpace)
      gl.pixelStorei(GL_UNPACK_ALIGNMENT, this.unpackAlignment)

      var target = this.target
      var miplevel = this.miplevel
      var image = this.image
      var canvas = this.canvas
      var video = this.video
      var data = this.data
      var internalformat = this.internalformat
      var format = this.format
      var type = this.type
      var width = this.width || Math.max(1, params.width >> miplevel)
      var height = this.height || Math.max(1, params.height >> miplevel)
      if (video && video.readyState > 2) {
        gl.texImage2D(target, miplevel, format, format, type, video)
      } else if (image && image.complete) {
        gl.texImage2D(target, miplevel, format, format, type, image)
      } else if (canvas) {
        gl.texImage2D(target, miplevel, format, format, type, canvas)
      } else if (this.compressed) {
        gl.compressedTexImage2D(target, miplevel, internalformat, width, height, 0, data)
      } else if (this.copy) {
        reglPoll()
        gl.copyTexImage2D(target, miplevel, format, this.x, this.y, width, height, 0)
      } else if (data) {
        gl.texImage2D(target, miplevel, format, width, height, 0, format, type, data)
      } else {
        gl.texImage2D(target, miplevel, format, width || 1, height || 1, 0, format, type, null)
      }
    }
  })

  function TexParams (target) {
    this.target = target

    // Default image shape info
    this.width = 0
    this.height = 0
    this.format = 0
    this.internalformat = 0
    this.type = 0

    // wrap mode
    this.wrapS = GL_CLAMP_TO_EDGE
    this.wrapT = GL_CLAMP_TO_EDGE

    // filtering
    this.minFilter = 0
    this.magFilter = GL_NEAREST
    this.anisotropic = 1

    // mipmaps
    this.genMipmaps = false
    this.mipmapHint = GL_DONT_CARE
  }

  extend(TexParams.prototype, {
    parse: function (options) {
      if (typeof options !== 'object' || !options) {
        return
      }

      if ('min' in options) {
        var minFilter = options.min
        
        this.minFilter = minFilters[minFilter]
      }

      if ('mag' in options) {
        var magFilter = options.mag
        
        this.magFilter = magFilters[magFilter]
      }

      var wrapS = this.wrapS
      var wrapT = this.wrapT
      if ('wrap' in options) {
        var wrap = options.wrap
        if (typeof wrap === 'string') {
          
          wrapS = wrapT = wrapModes[wrap]
        } else if (Array.isArray(wrap)) {
          
          
          wrapS = wrapModes[wrap[0]]
          wrapT = wrapModes[wrap[1]]
        }
      } else {
        if ('wrapS' in options) {
          var optWrapS = options.wrapS
          
          wrapS = wrapModes[optWrapS]
        }
        if ('wrapT' in options) {
          var optWrapT = options.wrapT
          
          wrapT = wrapModes[optWrapT]
        }
      }
      this.wrapS = wrapS
      this.wrapT = wrapT

      if ('anisotropic' in options) {
        var anisotropic = options.anisotropic
        
        this.anisotropic = options.anisotropic
      }

      if ('mipmap' in options) {
        var mipmap = options.mipmap
        switch (typeof mipmap) {
          case 'string':
            
            this.mipmapHint = mipmapHint[mipmap]
            this.genMipmaps = true
            break

          case 'boolean':
            this.genMipmaps = !!mipmap
            break

          case 'object':
            break

          default:
            
        }
      }
    },

    upload: function () {
      var target = this.target
      gl.texParameteri(target, GL_TEXTURE_MIN_FILTER, this.minFilter)
      gl.texParameteri(target, GL_TEXTURE_MAG_FILTER, this.magFilter)
      gl.texParameteri(target, GL_TEXTURE_WRAP_S, this.wrapS)
      gl.texParameteri(target, GL_TEXTURE_WRAP_T, this.wrapT)
      if (extensions.ext_texture_filter_anisotropic) {
        gl.texParameteri(target, GL_TEXTURE_MAX_ANISOTROPY_EXT, this.anisotropic)
      }
      if (this.genMipmaps) {
        gl.hint(GL_GENERATE_MIPMAP_HINT, this.mipmapHint)
        gl.generateMipmap(target)
      }
    }
  })

  // Final pass to merge params and pixel data
  function checkTextureComplete (params, pixels) {
    var i, pixmap

    var type = 0
    var format = 0
    var internalformat = 0
    var width = 0
    var height = 0
    var channels = 0
    var compressed = false
    var needsPoll = false
    var needsListeners = false
    var mipMask2D = 0
    var mipMaskCube = [0, 0, 0, 0, 0, 0]
    var cubeMask = 0
    var hasMip = false
    for (i = 0; i < pixels.length; ++i) {
      pixmap = pixels[i]
      width = width || (pixmap.width << pixmap.miplevel)
      height = height || (pixmap.height << pixmap.miplevel)
      type = type || pixmap.type
      format = format || pixmap.format
      internalformat = internalformat || pixmap.internalformat
      channels = channels || pixmap.channels
      needsPoll = needsPoll || pixmap.needsPoll
      needsListeners = needsListeners || pixmap.needsListeners
      compressed = compressed || pixmap.compressed

      var miplevel = pixmap.miplevel
      var target = pixmap.target
      hasMip = hasMip || (miplevel > 0)
      if (target === GL_TEXTURE_2D) {
        mipMask2D |= (1 << miplevel)
      } else {
        var face = target - GL_TEXTURE_CUBE_MAP_POSITIVE_X
        mipMaskCube[face] |= (1 << miplevel)
        cubeMask |= (1 << face)
      }
    }

    params.needsPoll = needsPoll
    params.needsListeners = needsListeners
    params.width = width
    params.height = height
    params.format = format
    params.internalformat = internalformat
    params.type = type

    var mipMask = hasMip ? (width << 1) - 1 : 1
    if (params.target === GL_TEXTURE_2D) {
      
      
    } else {
      
      for (i = 0; i < 6; ++i) {
        
      }
    }

    var mipFilter = (MIPMAP_FILTERS.indexOf(params.minFilter) >= 0)
    params.genMipmaps = !hasMip && (params.genMipmaps || mipFilter)
    var useMipmaps = hasMip || params.genMipmaps

    if (!params.minFilter) {
      params.minFilter = useMipmaps
        ? GL_LINEAR_MIPMAP_LINEAR
        : GL_NEAREST
    } else {
      
    }

    if (useMipmaps) {
      
    }

    if (params.genMipmaps) {
      
    }

    params.wrapS = params.wrapS || GL_CLAMP_TO_EDGE
    params.wrapT = params.wrapT || GL_CLAMP_TO_EDGE
    if (params.wrapS !== GL_CLAMP_TO_EDGE ||
        params.wrapT !== GL_CLAMP_TO_EDGE) {
      
    }

    if ((type === GL_FLOAT && !extensions.oes_texture_float_linear) ||
        (type === GL_HALF_FLOAT_OES &&
          !extensions.oes_texture_half_float_linear)) {
      
    }

    for (i = 0; i < pixels.length; ++i) {
      pixmap = pixels[i]
      var level = pixmap.miplevel
      if (pixmap.width) {
        
      }
      if (pixmap.height) {
        
      }
      if (pixmap.channels) {
        
      } else {
        pixmap.channels = channels
      }
      if (pixmap.format) {
        
      } else {
        pixmap.format = format
      }
      if (pixmap.internalformat) {
        
      } else {
        pixmap.internalformat = internalformat
      }
      if (pixmap.type) {
        
      } else {
        pixmap.type = type
      }
      if (pixmap.copy) {
        
      }
    }
  }

  var activeTexture = 0
  var textureCount = 0
  var textureSet = {}
  var pollSet = []
  var numTexUnits = limits.maxTextureUnits
  var textureUnits = Array(numTexUnits).map(function () {
    return null
  })

  function REGLTexture (target) {
    this.id = textureCount++
    this.refCount = 1

    this.target = target
    this.texture = null

    this.pollId = -1

    this.unit = -1
    this.bindCount = 0

    // cancels all pending callbacks
    this.cancelPending = null

    // parsed user inputs
    this.params = new TexParams(target)
    this.pixels = []
  }

  function update (texture, options) {
    var i
    clearListeners(texture)

    // Clear parameters and pixel data
    var params = texture.params
    TexParams.call(params, texture.target)
    var pixels = texture.pixels
    pixels.length = 0

    // parse parameters
    params.parse(options)

    // parse pixel data
    function parseMip (target, data) {
      var mipmap = data.mipmap
      var pixmap
      if (Array.isArray(mipmap)) {
        for (var i = 0; i < mipmap.length; ++i) {
          pixmap = new PixelInfo(target)
          pixmap.parseFlags(options)
          pixmap.parseFlags(data)
          pixmap.parse(mipmap[i], i)
          pixels.push(pixmap)
        }
      } else {
        pixmap = new PixelInfo(target)
        pixmap.parseFlags(options)
        pixmap.parse(data, 0)
        pixels.push(pixmap)
      }
    }
    if (texture.target === GL_TEXTURE_2D) {
      parseMip(GL_TEXTURE_2D, options)
    } else {
      var faces = options.faces || options
      if (Array.isArray(faces)) {
        
        for (i = 0; i < 6; ++i) {
          parseMip(GL_TEXTURE_CUBE_MAP_POSITIVE_X + i, faces[i])
        }
      } else if (typeof faces === 'string') {
        // TODO Read dds
      } else {
        // Initialize to all empty textures
        for (i = 0; i < 6; ++i) {
          parseMip(GL_TEXTURE_CUBE_MAP_POSITIVE_X + i, {})
        }
      }
    }

    // do a second pass to reconcile defaults
    checkTextureComplete(params, pixels)

    if (params.needsListeners) {
      hookListeners(texture)
    }

    if (params.needsPoll) {
      texture.pollId = pollSet.length
      pollSet.push(texture)
    }

    refresh(texture)
  }

  function refresh (texture) {
    if (!gl.isTexture(texture.texture)) {
      texture.texture = gl.createTexture()
    }

    // Lazy bind
    var target = texture.target
    var unit = texture.unit
    if (unit >= 0) {
      gl.activeTexture(GL_TEXTURE0 + unit)
      activeTexture = unit
    } else {
      gl.bindTexture(target, texture.texture)
    }

    // Upload
    var pixels = texture.pixels
    var params = texture.params
    for (var i = 0; i < pixels.length; ++i) {
      pixels[i].upload(params)
    }
    params.upload()

    // Lazy unbind
    if (unit < 0) {
      var active = textureUnits[activeTexture]
      if (active) {
        // restore binding state
        gl.bindTexture(active.target, active.texture)
      } else {
        // otherwise become new active
        texture.unit = activeTexture
        textureUnits[activeTexture] = texture
      }
    }
  }

  function hookListeners (texture) {
    var params = texture.params
    var pixels = texture.pixels

    // Appends all the texture data from the buffer to the current
    function appendDDS (target, miplevel, buffer) {
      var dds = parseDDS(buffer)

      

      if (dds.cube) {
        

        // TODO handle cube map DDS
        
      } else {
        
      }

      if (miplevel) {
        
      }

      dds.pixels.forEach(function (pixmap) {
        var info = new PixelInfo(dds.cube ? pixmap.target : target)

        info.channels = dds.channels
        info.compressed = dds.compressed
        info.type = dds.type
        info.internalformat = dds.format
        info.format = colorFormats[dds.format]

        info.width = pixmap.width
        info.height = pixmap.height
        info.miplevel = pixmap.miplevel || miplevel
        info.data = pixmap.data

        pixels.push(info)
      })
    }

    function onData () {
      // Update size of any newly loaded pixels
      for (var i = 0; i < pixels.length; ++i) {
        var pixelData = pixels[i]
        var image = pixelData.image
        var video = pixelData.video
        var xhr = pixelData.xhr
        if (image && image.complete) {
          pixelData.width = image.naturalWidth
          pixelData.height = image.naturalHeight
        } else if (video && video.readyState > 2) {
          pixelData.width = video.width
          pixelData.height = video.height
        } else if (xhr && xhr.readyState === 4) {
          pixels[i] = pixels[pixels.length - 1]
          pixels.pop()
          xhr.removeEventListener('readystatechange', refresh)
          appendDDS(pixelData.target, pixelData.miplevel, xhr.response)
        }
      }
      checkTextureComplete(params, pixels)
      refresh(texture)
    }

    pixels.forEach(function (pixelData) {
      if (pixelData.image && !pixelData.image.complete) {
        pixelData.image.addEventListener('load', onData)
      } else if (pixelData.video && pixelData.readyState < 1) {
        pixelData.video.addEventListener('progress', onData)
      } else if (pixelData.xhr) {
        pixelData.xhr.addEventListener('readystatechange', onData)
      }
    })

    texture.cancelPending = function detachListeners () {
      pixels.forEach(function (pixelData) {
        if (pixelData.image) {
          pixelData.image.removeEventListener('load', onData)
        } else if (pixelData.video) {
          pixelData.video.removeEventListener('progress', onData)
        } else if (pixelData.xhr) {
          pixelData.xhr.removeEventListener('readystatechange', onData)
          pixelData.xhr.abort()
        }
      })
    }
  }

  function clearListeners (texture) {
    var cancelPending = texture.cancelPending
    if (cancelPending) {
      cancelPending()
      texture.cancelPending = null
    }
    var id = texture.pollId
    if (id >= 0) {
      var other = pollSet[id] = pollSet[pollSet.length - 1]
      other.id = id
      pollSet.pop()
      texture.pollId = -1
    }
  }

  function destroy (texture) {
    var handle = texture.texture
    
    var unit = texture.unit
    var target = texture.target
    if (unit >= 0) {
      gl.activeTexture(GL_TEXTURE0 + unit)
      activeTexture = unit
      gl.bindTexture(target, null)
      textureUnits[unit] = null
    }
    clearListeners(texture)
    if (gl.isTexture(handle)) {
      gl.deleteTexture(handle)
    }
    texture.texture = null
    texture.params = null
    texture.pixels = null
    texture.refCount = 0
    delete textureSet[texture.id]
  }

  extend(REGLTexture.prototype, {
    bind: function () {
      var texture = this
      texture.bindCount += 1
      var unit = texture.unit
      if (unit < 0) {
        for (var i = 0; i < numTexUnits; ++i) {
          var other = textureUnits[i]
          if (other) {
            if (other.bindCount > 0) {
              continue
            }
            other.unit = -1
          }
          textureUnits[i] = texture
          unit = i
          break
        }
        if (unit >= numTexUnits) {
          
        }
        texture.unit = unit
        gl.activeTexture(GL_TEXTURE0 + unit)
        gl.bindTexture(texture.target, texture.texture)
        activeTexture = unit
      }
      return unit
    },

    unbind: function () {
      this.bindCount -= 1
    },

    decRef: function () {
      if (--this.refCount === 0) {
        destroy(this)
      }
    }
  })

  function createTexture (options, target) {
    var texture = new REGLTexture(target)
    textureSet[texture.id] = texture

    function reglTexture (a0, a1, a2, a3, a4, a5) {
      var options = a0 || {}
      if (target === GL_TEXTURE_CUBE_MAP && arguments.length === 6) {
        options = [a0, a1, a2, a3, a4, a5]
      }
      update(texture, options)
      reglTexture.width = texture.params.width
      reglTexture.height = texture.params.height
      return reglTexture
    }

    reglTexture(options)

    reglTexture._reglType = 'texture'
    reglTexture._texture = texture
    reglTexture.destroy = function () {
      texture.decRef()
    }
  
    return reglTexture
  }

  // Called after context restore
  function refreshTextures () {
    values(textureSet).forEach(refresh)
    for (var i = 0; i < numTexUnits; ++i) {
      textureUnits[i] = null
    }
    activeTexture = 0
    gl.activeTexture(GL_TEXTURE0)
  }

  // Called when regl is destroyed
  function destroyTextures () {
    for (var i = 0; i < numTexUnits; ++i) {
      gl.activeTexture(GL_TEXTURE0 + i)
      gl.bindTexture(GL_TEXTURE_2D, null)
      textureUnits[i] = null
    }
    gl.activeTexture(GL_TEXTURE0)
    activeTexture = 0
    values(textureSet).forEach(destroy)
  }

  // Called once per raf, updates video textures
  function pollTextures () {
    pollSet.forEach(refresh)
  }

  return {
    create: createTexture,
    refresh: refreshTextures,
    clear: destroyTextures,
    poll: pollTextures,
    getTexture: function (wrapper) {
      return null
    }
  }
}

},{"./extend":14,"./is-ndarray":17,"./is-typed-array":18,"./load-texture":20,"./parse-dds":21,"./to-half-float":30,"./values":32}],30:[function(require,module,exports){
module.exports = function convertToHalfFloat (array) {
  var floats = new Float32Array(array)
  var uints = new Uint32Array(floats.buffer)
  var ushorts = new Uint16Array(array.length)

  for (var i = 0; i < array.length; ++i) {
    if (isNaN(array[i])) {
      ushorts[i] = 0xffff
    } else if (array[i] === Infinity) {
      ushorts[i] = 0x7c00
    } else if (array[i] === -Infinity) {
      ushorts[i] = 0xfc00
    } else {
      var x = uints[i]

      var sgn = (x >>> 31) << 15
      var exp = ((x << 1) >>> 24) - 127
      var frac = (x >> 13) & ((1 << 10) - 1)

      if (exp < -24) {
        // round non-representable denormals to 0
        ushorts[i] = sgn
      } else if (exp < -14) {
        // handle denormals
        var s = -14 - exp
        ushorts[i] = sgn + ((frac + (1 << 10)) >> s)
      } else if (exp > 15) {
        // round overflow to +/- Infinity
        ushorts[i] = sgn + 0x7c00
      } else {
        // otherwise convert directly
        ushorts[i] = sgn + ((exp + 15) << 10) + frac
      }
    }
  }

  return ushorts
}

},{}],31:[function(require,module,exports){
module.exports = function wrapUniformState (stringStore) {
  var uniformState = {}

  function defUniform (name) {
    var id = stringStore.id(name)
    var result = uniformState[id]
    if (!result) {
      result = uniformState[id] = [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      ]
    }
    return result
  }

  return {
    def: defUniform
  }
}

},{}],32:[function(require,module,exports){
module.exports = function (obj) {
  return Object.keys(obj).map(function (key) { return obj[key] })
}

},{}],33:[function(require,module,exports){
'use strict'

module.exports = angleNormals

function hypot(x, y, z) {
  return Math.sqrt(Math.pow(x,2) + Math.pow(y,2) + Math.pow(z,2))
}

function weight(s, r, a) {
  return Math.atan2(r, (s - a))
}

function mulAdd(dest, s, x, y, z) {
  dest[0] += s * x
  dest[1] += s * y
  dest[2] += s * z
}

function angleNormals(cells, positions) {
  var numVerts = positions.length
  var numCells = cells.length

  //Allocate normal array
  var normals = new Array(numVerts)
  for(var i=0; i<numVerts; ++i) {
    normals[i] = [0,0,0]
  }

  //Scan cells, and
  for(var i=0; i<numCells; ++i) {
    var cell = cells[i]
    var a = positions[cell[0]]
    var b = positions[cell[1]]
    var c = positions[cell[2]]

    var abx = a[0] - b[0]
    var aby = a[1] - b[1]
    var abz = a[2] - b[2]
    var ab = hypot(abx, aby, abz)

    var bcx = b[0] - c[0]
    var bcy = b[1] - c[1]
    var bcz = b[2] - c[2]
    var bc = hypot(bcx, bcy, bcz)

    var cax = c[0] - a[0]
    var cay = c[1] - a[1]
    var caz = c[2] - a[2]
    var ca = hypot(cax, cay, caz)

    if(Math.min(ab, bc, ca) < 1e-6) {
      continue
    }

    var s = 0.5 * (ab + bc + ca)
    var r = Math.sqrt((s - ab)*(s - bc)*(s - ca)/s)

    var nx = aby * bcz - abz * bcy
    var ny = abz * bcx - abx * bcz
    var nz = abx * bcy - aby * bcx
    var nl = hypot(nx, ny, nz)
    nx /= nl
    ny /= nl
    nz /= nl

    mulAdd(normals[cell[0]], weight(s, r, bc), nx, ny, nz)
    mulAdd(normals[cell[1]], weight(s, r, ca), nx, ny, nz)
    mulAdd(normals[cell[2]], weight(s, r, ab), nx, ny, nz)
  }

  //Normalize all the normals
  for(var i=0; i<numVerts; ++i) {
    var n = normals[i]
    var l = Math.sqrt(
      Math.pow(n[0], 2) +
      Math.pow(n[1], 2) +
      Math.pow(n[2], 2))
    if(l < 1e-8) {
      n[0] = 1
      n[1] = 0
      n[2] = 0
      continue
    }
    n[0] /= l
    n[1] /= l
    n[2] /= l
  }

  return normals
}

},{}],34:[function(require,module,exports){
exports.positions=[[1.301895,0.122622,2.550061],[1.045326,0.139058,2.835156],[0.569251,0.155925,2.805125],[0.251886,0.144145,2.82928],[0.063033,0.131726,3.01408],[-0.277753,0.135892,3.10716],[-0.441048,0.277064,2.594331],[-1.010956,0.095285,2.668983],[-1.317639,0.069897,2.325448],[-0.751691,0.264681,2.381496],[0.684137,0.31134,2.364574],[1.347931,0.302882,2.201434],[-1.736903,0.029894,1.724111],[-1.319986,0.11998,0.912925],[1.538077,0.157372,0.481711],[1.951975,0.081742,1.1641],[1.834768,0.095832,1.602682],[2.446122,0.091817,1.37558],[2.617615,0.078644,0.742801],[-1.609748,0.04973,-0.238721],[-1.281973,0.230984,-0.180916],[-1.074501,0.248204,0.034007],[-1.201734,0.058499,0.402234],[-1.444454,0.054783,0.149579],[-4.694605,5.075882,1.043427],[-3.95963,7.767394,0.758447],[-4.753339,5.339817,0.665061],[-1.150325,9.133327,-0.368552],[-4.316107,2.893611,0.44399],[-0.809202,9.312575,-0.466061],[0.085626,5.963693,1.685666],[-1.314853,9.00142,-0.1339],[-4.364182,3.072556,1.436712],[-2.022074,7.323396,0.678657],[1.990887,6.13023,0.479643],[-3.295525,7.878917,1.409353],[0.571308,6.197569,0.670657],[0.89661,6.20018,0.337056],[0.331851,6.162372,1.186371],[-4.840066,5.599874,2.296069],[2.138989,6.031291,0.228335],[0.678923,6.026173,1.894052],[-0.781682,5.601573,1.836738],[1.181315,6.239007,0.393293],[-3.606308,7.376476,2.661452],[-0.579059,4.042511,-1.540883],[-3.064069,8.630253,-2.597539],[-2.157271,6.837012,0.300191],[-2.966013,7.821581,-1.13697],[-2.34426,8.122965,0.409043],[-0.951684,5.874251,1.415119],[-2.834853,7.748319,0.182406],[-3.242493,7.820096,0.373674],[-0.208532,5.992846,1.252084],[-3.048085,8.431527,-2.129795],[1.413245,5.806324,2.243906],[-0.051222,6.064901,0.696093],[-4.204306,2.700062,0.713875],[-4.610997,6.343405,0.344272],[-3.291336,9.30531,-3.340445],[-3.27211,7.559239,-2.324016],[-4.23882,6.498344,3.18452],[-3.945317,6.377804,3.38625],[-4.906378,5.472265,1.315193],[-3.580131,7.846717,0.709666],[-1.995504,6.645459,0.688487],[-2.595651,7.86054,0.793351],[-0.008849,0.305871,0.184484],[-0.029011,0.314116,-0.257312],[-2.522424,7.565392,1.804212],[-1.022993,8.650826,-0.855609],[-3.831265,6.595426,3.266783],[-4.042525,6.855724,3.060663],[-4.17126,7.404742,2.391387],[3.904526,3.767693,0.092179],[0.268076,6.086802,1.469223],[-3.320456,8.753222,-2.08969],[1.203048,6.26925,0.612407],[-4.406479,2.985974,0.853691],[-3.226889,6.615215,-0.404243],[0.346326,1.60211,3.509858],[-3.955476,7.253323,2.722392],[-1.23204,0.068935,1.68794],[0.625436,6.196455,1.333156],[4.469132,2.165298,1.70525],[0.950053,6.262899,0.922441],[-2.980404,5.25474,-0.663155],[-4.859043,6.28741,1.537081],[-3.077453,4.641475,-0.892167],[-0.44002,8.222503,-0.771454],[-4.034112,7.639786,0.389935],[-3.696045,6.242042,3.394679],[-1.221806,7.783617,0.196451],[0.71461,6.149895,1.656636],[-4.713539,6.163154,0.495369],[-1.509869,0.913044,-0.832413],[-1.547249,2.066753,-0.852669],[-3.757734,5.793742,3.455794],[-0.831911,0.199296,1.718536],[-3.062763,7.52718,-1.550559],[0.938688,6.103354,1.820958],[-4.037033,2.412311,0.988026],[-4.130746,2.571806,1.101689],[-0.693664,9.174283,-0.952323],[-1.286742,1.079679,-0.751219],[1.543185,1.408925,3.483132],[1.535973,2.047979,3.655029],[0.93844,5.84101,2.195219],[-0.684401,5.918492,1.20109],[1.28844,2.008676,3.710781],[-3.586722,7.435506,-1.454737],[-0.129975,4.384192,2.930593],[-1.030531,0.281374,3.214273],[-3.058751,8.137238,-3.227714],[3.649524,4.592226,1.340021],[-3.354828,7.322425,-1.412086],[0.936449,6.209237,1.512693],[-1.001832,3.590411,-1.545892],[-3.770486,4.593242,2.477056],[-0.971925,0.067797,0.921384],[-4.639832,6.865407,2.311791],[-0.441014,8.093595,-0.595999],[-2.004852,6.37142,1.635383],[4.759591,1.92818,0.328328],[3.748064,1.224074,2.140484],[-0.703601,5.285476,2.251988],[0.59532,6.21893,0.981004],[0.980799,6.257026,1.24223],[1.574697,6.204981,0.381628],[1.149594,6.173608,1.660763],[-3.501963,5.895989,3.456576],[1.071122,5.424198,2.588717],[-0.774693,8.473335,-0.276957],[3.849959,4.15542,0.396742],[-0.801715,4.973149,-1.068582],[-2.927676,0.625112,2.326393],[2.669682,4.045542,2.971184],[-4.391324,4.74086,0.343463],[1.520129,6.270031,0.775471],[1.837586,6.084731,0.109188],[1.271475,5.975024,2.032355],[-3.487968,4.513249,2.605871],[-1.32234,1.517264,-0.691879],[-1.080301,1.648226,-0.805526],[-3.365703,6.910166,-0.454902],[1.36034,0.432238,3.075004],[-3.305013,5.774685,3.39142],[3.88432,0.654141,0.12574],[3.57254,0.377934,0.302501],[4.196136,0.807999,0.212229],[3.932997,0.543123,0.380579],[4.023704,3.286125,0.537597],[1.864455,4.916544,2.691677],[-4.775427,6.499498,1.440153],[-3.464928,3.68234,2.766356],[3.648972,1.751262,2.157485],[1.179111,3.238846,3.774796],[-0.171164,0.299126,-0.592669],[-4.502912,3.316656,0.875188],[-0.948454,9.214025,-0.679508],[1.237665,6.288593,1.046],[1.523423,6.268963,1.139544],[1.436519,6.140608,1.739316],[3.723607,1.504355,2.136762],[2.009495,4.045514,3.22053],[-1.921944,7.249905,0.213973],[1.254068,1.205518,3.474709],[-0.317087,5.996269,0.525872],[-2.996914,3.934607,2.900178],[-3.316873,4.028154,2.785696],[-3.400267,4.280157,2.689268],[-3.134842,4.564875,2.697192],[1.480563,4.692567,2.834068],[0.873682,1.315452,3.541585],[1.599355,0.91622,3.246769],[-3.292102,7.125914,2.768515],[3.74296,4.511299,0.616539],[4.698935,1.55336,0.26921],[-3.274387,3.299421,2.823946],[-2.88809,3.410699,2.955248],[1.171407,1.76905,3.688472],[1.430276,3.92483,3.473666],[3.916941,2.553308,0.018941],[0.701632,2.442372,3.778639],[1.562657,2.302778,3.660957],[4.476622,1.152407,0.182131],[-0.61136,5.761367,1.598838],[-3.102154,3.691687,2.903738],[1.816012,5.546167,2.380308],[3.853928,4.25066,0.750017],[1.234681,3.581665,3.673723],[1.862271,1.361863,3.355209],[1.346844,4.146995,3.327877],[1.70672,4.080043,3.274307],[0.897242,1.908983,3.6969],[-0.587022,9.191132,-0.565301],[-0.217426,5.674606,2.019968],[0.278925,6.120777,0.485403],[1.463328,3.578742,-2.001464],[-3.072985,4.264581,2.789502],[3.62353,4.673843,0.383452],[-3.053491,8.752377,-2.908434],[-2.628687,4.505072,2.755601],[0.891047,5.113781,2.748272],[-2.923732,3.06515,2.866368],[0.848008,4.754252,2.896972],[-3.319184,8.811641,-2.327412],[0.12864,8.814781,-1.334456],[1.549501,4.549331,-1.28243],[1.647161,3.738973,3.507719],[1.250888,0.945599,3.348739],[3.809662,4.038822,0.053142],[1.483166,0.673327,3.09156],[0.829726,3.635921,3.713103],[1.352914,5.226651,2.668113],[2.237352,4.37414,3.016386],[4.507929,0.889447,0.744249],[4.57304,1.010981,0.496588],[3.931422,1.720989,2.088175],[-0.463177,5.989835,0.834346],[-2.811236,3.745023,2.969587],[-2.805135,4.219721,2.841108],[-2.836842,4.802543,2.60826],[1.776716,2.084611,3.568638],[4.046881,1.463478,2.106273],[0.316265,5.944313,1.892785],[-2.86347,2.776049,2.77242],[-2.673644,3.116508,2.907104],[-2.621149,4.018502,2.903409],[-2.573447,5.198013,2.477481],[1.104039,2.278985,3.722469],[-4.602743,4.306413,0.902296],[-2.684878,1.510731,0.535039],[0.092036,8.473269,-0.99413],[-1.280472,5.602393,1.928105],[-1.0279,4.121582,-1.403103],[-2.461081,3.304477,2.957317],[-2.375929,3.659383,2.953233],[1.417579,2.715389,3.718767],[0.819727,2.948823,3.810639],[1.329962,0.761779,3.203724],[1.73952,5.295229,2.537725],[0.952523,3.945016,3.548229],[-2.569498,0.633669,2.84818],[-2.276676,0.757013,2.780717],[-2.013147,7.354429,-0.003202],[0.93143,1.565913,3.600325],[1.249014,1.550556,3.585842],[2.287252,4.072353,3.124544],[-4.7349,7.006244,1.690653],[-3.500602,8.80386,-2.009196],[-0.582629,5.549138,2.000923],[-1.865297,6.356066,1.313593],[-3.212154,2.376143,-0.565593],[2.092889,3.493536,-1.727931],[-2.528501,2.784531,2.833758],[-2.565697,4.893154,2.559605],[-2.153366,5.04584,2.465215],[1.631311,2.568241,3.681445],[2.150193,4.699227,2.807505],[0.507599,5.01813,2.775892],[4.129862,1.863698,2.015101],[3.578279,4.50766,-0.009598],[3.491023,4.806749,1.549265],[0.619485,1.625336,3.605125],[1.107499,2.932557,3.790061],[-2.082292,6.99321,0.742601],[4.839909,1.379279,0.945274],[3.591328,4.322645,-0.259497],[1.055245,0.710686,3.16553],[-3.026494,7.842227,1.624553],[0.146569,6.119214,0.981673],[-2.043687,2.614509,2.785526],[-2.302242,3.047775,2.936355],[-2.245686,4.100424,2.87794],[2.116148,5.063507,2.572204],[-1.448406,7.64559,0.251692],[2.550717,4.9268,2.517526],[-2.955456,7.80293,-1.782407],[1.882995,4.637167,2.895436],[-2.014924,3.398262,2.954896],[-2.273654,4.771227,2.611418],[-2.162723,7.876761,0.702473],[-0.198659,5.823062,1.739272],[-1.280908,2.133189,-0.921241],[2.039932,4.251568,3.136579],[1.477815,4.354333,3.108325],[0.560504,3.744128,3.6913],[-2.234018,1.054373,2.352782],[-3.189156,7.686661,-2.514955],[-3.744736,7.69963,2.116973],[-2.283366,2.878365,2.87882],[-2.153786,4.457481,2.743529],[4.933978,1.677287,0.713773],[3.502146,0.535336,1.752511],[1.825169,4.419253,3.081198],[3.072331,0.280979,0.106534],[-0.508381,1.220392,2.878049],[-3.138824,8.445394,-1.659711],[-2.056425,2.954815,2.897241],[-2.035343,5.398477,2.215842],[-3.239915,7.126798,-0.712547],[-1.867923,7.989805,0.526518],[1.23405,6.248973,1.387189],[-0.216492,8.320933,-0.862495],[-2.079659,3.755709,2.928563],[-1.78595,4.300374,2.805295],[-1.856589,5.10678,2.386572],[-1.714362,5.544778,2.004623],[1.722403,4.200291,-1.408161],[0.195386,0.086928,-1.318006],[1.393693,3.013404,3.710686],[-0.415307,8.508471,-0.996883],[-1.853777,0.755635,2.757275],[-1.724057,3.64533,2.884251],[-1.884511,4.927802,2.530885],[-1.017174,7.783908,-0.227078],[-1.7798,2.342513,2.741749],[-1.841329,3.943996,2.88436],[1.430388,5.468067,2.503467],[-2.030296,0.940028,2.611088],[-1.677028,1.215666,2.607771],[-1.74092,2.832564,2.827295],[4.144673,0.631374,0.503358],[4.238811,0.653992,0.762436],[-1.847016,2.082815,2.642674],[4.045764,3.194073,0.852117],[-1.563989,8.112739,0.303102],[-1.781627,1.794836,2.602338],[-1.493749,2.533799,2.797251],[-1.934496,4.690689,2.658999],[-1.499174,5.777946,1.747498],[-2.387409,0.851291,1.500524],[-1.872211,8.269987,0.392533],[-4.647726,6.765771,0.833653],[-3.157482,0.341958,-0.20671],[-1.725766,3.24703,2.883579],[-1.458199,4.079031,2.836325],[-1.621548,4.515869,2.719266],[-1.607292,4.918914,2.505881],[-1.494661,5.556239,1.991599],[-1.727269,7.423769,0.012337],[-1.382497,1.161322,2.640222],[-1.52129,4.681714,2.615467],[-4.247127,2.792812,1.250843],[-1.576338,0.742947,2.769799],[-1.499257,2.172763,2.743142],[-1.480392,3.103261,2.862262],[1.049137,2.625836,3.775384],[-1.368063,1.791587,2.695516],[-1.307839,2.344534,2.767575],[-1.336758,5.092221,2.355225],[-1.5617,5.301749,2.21625],[-1.483362,8.537704,0.196752],[-1.517348,8.773614,0.074053],[-1.474302,1.492731,2.641433],[2.48718,0.644247,-0.920226],[0.818091,0.422682,3.171218],[-3.623398,6.930094,3.033045],[1.676333,3.531039,3.591591],[1.199939,5.683873,2.365623],[-1.223851,8.841201,0.025414],[-1.286307,3.847643,2.918044],[-1.25857,4.810831,2.543605],[2.603662,5.572146,1.991854],[0.138984,5.779724,2.077834],[-1.267039,3.175169,2.890889],[-1.293616,3.454612,2.911774],[-2.60112,1.277184,0.07724],[2.552779,3.649877,3.163643],[-1.038983,1.248011,2.605933],[-1.288709,4.390967,2.761214],[-1.034218,5.485963,2.011467],[-1.185576,1.464842,2.624335],[-1.045682,2.54896,2.761102],[4.259176,1.660627,2.018096],[-0.961707,1.717183,2.598342],[-1.044603,3.147464,2.855335],[-0.891998,4.685429,2.669696],[-1.027561,5.081672,2.377939],[4.386506,0.832434,0.510074],[-1.014225,9.064991,-0.175352],[-1.218752,2.895443,2.823785],[-0.972075,4.432669,2.788005],[-2.714986,0.52425,1.509798],[-0.699248,1.517219,2.645738],[-1.161581,2.078852,2.722795],[-0.845249,3.286247,2.996471],[1.068329,4.443444,2.993863],[3.98132,3.715557,1.027775],[1.658097,3.982428,-1.651688],[-4.053701,2.449888,0.734746],[-0.910935,2.214149,2.702393],[0.087824,3.96165,3.439344],[-0.779714,3.724134,2.993429],[-1.051093,3.810797,2.941957],[-0.644941,4.3859,2.870863],[-2.98403,8.666895,-3.691888],[-0.754304,2.508325,2.812999],[-4.635524,3.662891,0.913005],[-0.983299,4.125978,2.915378],[4.916497,1.905209,0.621315],[4.874983,1.728429,0.468521],[2.33127,5.181957,2.441697],[-0.653711,2.253387,2.7949],[-3.623744,8.978795,-2.46192],[-4.555927,6.160279,0.215755],[-4.940628,5.806712,1.18383],[3.308506,2.40326,-0.910776],[0.58835,5.251928,-0.992886],[2.152215,5.449733,2.331679],[-0.712755,0.766765,3.280375],[-0.741771,1.9716,2.657235],[-4.828957,5.566946,2.635623],[-3.474788,8.696771,-1.776121],[1.770417,6.205561,1.331627],[-0.620626,4.064721,2.968972],[-1.499187,2.307735,-0.978901],[4.098793,2.330245,1.667951],[1.940444,6.167057,0.935904],[-2.314436,1.104995,1.681277],[-2.733629,7.742793,1.7705],[-0.452248,4.719868,2.740834],[-0.649143,4.951713,2.541296],[-0.479417,9.43959,-0.676324],[-2.251853,6.559275,0.046819],[0.033531,8.316907,-0.789939],[-0.513125,0.995673,3.125462],[-2.637602,1.039747,0.602434],[1.527513,6.230089,1.430903],[4.036124,2.609846,1.506498],[-3.559828,7.877892,1.228076],[-4.570736,4.960193,0.838201],[-0.432121,5.157731,2.467518],[-1.206735,4.562511,-1.237054],[-0.823768,3.788746,-1.567481],[-3.095544,7.353613,-1.024577],[-4.056088,7.631119,2.062001],[-0.289385,5.382261,2.329421],[1.69752,6.136483,1.667037],[-0.168758,5.061138,2.617453],[2.853576,1.605528,-1.229958],[-4.514319,6.586675,0.352756],[-2.558081,7.741151,1.29295],[1.61116,5.92358,2.071534],[3.936921,3.354857,0.091755],[-0.1633,1.119272,3.147975],[0.067551,1.593475,3.38212],[-1.303239,2.328184,-1.011672],[-0.438093,0.73423,3.398384],[-4.62767,3.898187,0.849573],[0.286853,4.165281,3.284834],[-2.968052,8.492812,-3.493693],[-0.111896,3.696111,3.53791],[-3.808245,8.451731,-1.574742],[0.053416,5.558764,2.31107],[3.956269,3.012071,0.11121],[-0.710956,8.106561,-0.665154],[0.234725,2.717326,3.722379],[-0.031594,2.76411,3.657347],[-0.017371,4.700633,2.81911],[0.215064,5.034859,2.721426],[-0.111151,8.480333,-0.649399],[3.97942,3.575478,0.362219],[0.392962,4.735392,2.874321],[4.17015,2.085087,1.865999],[0.169054,1.244786,3.337709],[0.020049,3.165818,3.721736],[0.248212,3.595518,3.698376],[0.130706,5.295541,2.540034],[-4.541357,4.798332,1.026866],[-1.277485,1.289518,-0.667272],[3.892133,3.54263,-0.078056],[4.057379,3.03669,0.997913],[0.287719,0.884758,3.251787],[0.535771,1.144701,3.400096],[0.585303,1.399362,3.505353],[0.191551,2.076246,3.549355],[0.328656,2.394576,3.649623],[0.413124,3.240728,3.771515],[0.630361,4.501549,2.963623],[0.529441,5.854392,2.120225],[3.805796,3.769958,-0.162079],[3.447279,4.344846,-0.467276],[0.377618,5.551116,2.426017],[0.409355,1.821269,3.606333],[0.719959,2.194726,3.703851],[0.495922,3.501519,3.755661],[0.603408,5.354097,2.603088],[-4.605056,7.531978,1.19579],[0.907972,0.973128,3.356513],[0.750134,3.356137,3.765847],[0.4496,3.993244,3.504544],[-3.030738,7.48947,-1.259169],[0.707505,5.602005,2.43476],[0.668944,0.654891,3.213797],[0.593244,2.700978,3.791427],[1.467759,3.30327,3.71035],[3.316249,2.436388,2.581175],[3.26138,1.724425,2.539028],[-1.231292,7.968263,0.281414],[-0.108773,8.712307,-0.790607],[4.445684,1.819442,1.896988],[1.998959,2.281499,3.49447],[2.162269,2.113817,3.365449],[4.363397,1.406731,1.922714],[4.808,2.225842,0.611127],[2.735919,0.771812,-0.701142],[1.897735,2.878428,3.583482],[-3.31616,5.331985,3.212394],[-3.3314,6.018137,3.313018],[-3.503183,6.480103,3.222216],[-1.904453,5.750392,1.913324],[-1.339735,3.559592,-1.421817],[-1.044242,8.22539,0.037414],[1.643492,3.110676,3.647424],[3.992832,3.686244,0.710946],[1.774207,1.71842,3.475768],[-3.438842,5.5713,3.427818],[4.602447,1.2583,1.619528],[-0.925516,7.930042,0.072336],[-1.252093,3.846565,-1.420761],[-3.426857,5.072419,2.97806],[-3.160408,6.152629,3.061869],[3.739931,3.367082,2.041273],[1.027419,4.235891,3.251253],[4.777703,1.887452,1.560409],[-3.318528,6.733796,2.982968],[2.929265,4.962579,2.271079],[3.449761,2.838629,2.474576],[-3.280159,5.029875,2.787514],[4.068939,2.993629,0.741567],[0.303312,8.70927,-1.121972],[0.229852,8.981322,-1.186075],[-0.011045,9.148156,-1.047057],[-2.942683,5.579613,2.929297],[-3.145409,5.698727,3.205778],[-3.019089,6.30887,2.794323],[-3.217135,6.468191,2.970032],[-3.048298,6.993641,2.623378],[-3.07429,6.660982,2.702434],[3.612011,2.5574,2.25349],[2.54516,4.553967,2.75884],[-1.683759,7.400787,0.250868],[-1.756066,7.463557,0.448031],[-3.023761,5.149697,2.673539],[3.112376,2.677218,2.782378],[2.835327,4.581196,2.567146],[-2.973799,7.225458,2.506988],[-0.591645,8.740662,-0.505845],[3.782861,2.04337,2.03066],[3.331604,3.36343,2.605047],[2.966866,1.205497,2.537432],[0.002669,9.654748,-1.355559],[2.632801,0.58497,2.540311],[-2.819398,5.087372,2.521098],[2.616193,5.332961,2.194288],[-3.193973,4.925634,2.607924],[-3.12618,5.27524,2.944544],[-0.426003,8.516354,-0.501528],[2.802717,1.387643,2.751649],[-3.120597,7.889111,-2.75431],[2.636648,1.71702,2.991302],[-2.853151,6.711792,2.430276],[-2.843836,6.962865,2.400842],[1.9696,3.199023,3.504514],[-2.461751,0.386352,3.008994],[1.64127,0.495758,3.02958],[-4.330472,5.409831,0.025287],[-2.912387,5.980416,2.844261],[-2.490069,0.211078,2.985391],[3.581816,4.809118,0.733728],[2.693199,2.647213,3.126709],[-0.182964,8.184108,-0.638459],[-2.226855,0.444711,2.946552],[-0.720175,8.115055,0.017689],[2.645302,4.316212,2.850139],[-0.232764,9.329503,-0.918639],[4.852365,1.471901,0.65275],[2.76229,2.014994,2.957755],[-2.808374,5.354301,2.644695],[-2.790967,6.406963,2.547985],[-1.342684,0.418488,-1.669183],[2.690675,5.593587,-0.041236],[4.660146,1.6318,1.713314],[2.775667,3.007229,3.111332],[-0.396696,8.963432,-0.706202],[2.446707,2.740617,3.321433],[-4.803209,5.884634,2.603672],[-2.652003,1.6541,1.5078],[3.932327,3.972874,0.831924],[2.135906,0.955587,2.986608],[2.486131,2.053802,3.124115],[-0.386706,8.115753,-0.37565],[-2.720727,7.325044,2.224878],[-1.396946,7.638016,-0.16486],[-0.62083,7.989771,-0.144413],[-2.653272,5.729684,2.667679],[3.038188,4.65835,2.364142],[2.381721,0.739472,2.788992],[-2.345829,5.474929,2.380633],[-2.518983,6.080562,2.479383],[-2.615793,6.839622,2.186116],[-2.286566,0.143752,2.766848],[-4.771219,6.508766,1.070797],[3.717308,2.905019,2.097994],[2.50521,3.016743,3.295898],[2.208448,1.56029,3.216806],[3.346783,1.01254,2.119951],[2.653503,3.26122,3.175738],[-2.359636,5.827519,2.402297],[-1.952693,0.558102,2.853307],[-0.321562,9.414885,-1.187501],[3.138923,1.405072,2.520765],[1.493728,1.780051,3.621969],[3.01817,0.907291,2.336909],[3.183548,1.185297,2.352175],[1.608619,5.006753,2.695131],[-4.723919,6.836107,1.095288],[-1.017586,8.865429,-0.149328],[4.730762,1.214014,0.64008],[-2.135182,6.647907,1.495471],[-2.420382,6.546114,2.108209],[-2.458053,7.186346,1.896623],[3.437124,0.275798,1.138203],[0.095925,8.725832,-0.926481],[2.417376,2.429869,3.287659],[2.279951,1.200317,3.049994],[2.674753,2.326926,3.044059],[-2.328123,6.849164,1.75751],[-3.418616,7.853407,0.126248],[-3.151587,7.77543,-0.110889],[2.349144,5.653242,2.05869],[-2.273236,6.085631,2.242888],[-4.560601,4.525342,1.261241],[2.866334,3.796067,2.934717],[-2.17493,6.505518,1.791367],[3.12059,3.283157,2.818869],[3.037703,3.562356,2.866653],[0.066233,9.488418,-1.248237],[2.749941,0.975018,2.573371],[-2.155749,5.801033,2.204009],[-2.162778,6.261889,2.028596],[1.936874,0.459142,2.956718],[3.176249,4.335541,2.440447],[4.356599,1.029423,1.700589],[3.873502,3.082678,1.80431],[2.895489,4.243034,2.735259],[-0.095774,9.468195,-1.07451],[-1.124982,7.886808,-0.480851],[3.032304,3.065454,2.897927],[3.692687,4.5961,0.957858],[-3.013045,3.807235,-1.098381],[-0.790012,8.92912,-0.367572],[1.905793,0.73179,2.996728],[3.530396,3.426233,2.356583],[2.12299,0.624933,2.929167],[-2.069196,6.039284,2.01251],[-3.565623,7.182525,2.850039],[2.959264,2.376337,2.829242],[2.949071,1.822483,2.793933],[4.036142,0.763803,1.703744],[-1.993527,6.180318,1.804936],[-0.030987,0.766389,3.344766],[-0.549683,8.225193,-0.189341],[-0.765469,8.272246,-0.127174],[-2.947047,7.541648,-0.414113],[-3.050327,9.10114,-3.435619],[3.488566,2.231807,2.399836],[3.352283,4.727851,1.946438],[4.741011,2.162773,1.499574],[-1.815093,6.072079,1.580722],[-3.720969,8.267927,-0.984713],[1.932826,3.714052,3.427488],[3.323617,4.438961,2.20732],[0.254111,9.26364,-1.373244],[-1.493384,7.868585,-0.450051],[-0.841901,0.776135,-1.619467],[0.243537,6.027668,0.091687],[0.303057,0.313022,-0.531105],[-0.435273,0.474098,3.481552],[2.121507,2.622389,3.486293],[1.96194,1.101753,3.159584],[3.937991,3.407551,1.551392],[0.070906,0.295753,1.377185],[-1.93588,7.631764,0.651674],[-2.523531,0.744818,-0.30985],[2.891496,3.319875,2.983079],[4.781765,1.547061,1.523129],[-2.256064,7.571251,0.973716],[3.244861,3.058249,2.724392],[-0.145855,0.437775,3.433662],[1.586296,5.658538,2.358487],[3.658336,3.774921,2.071837],[2.840463,4.817098,2.46376],[-1.219464,8.122542,-0.672808],[-2.520906,2.664486,-1.034346],[-1.315417,8.471365,-0.709557],[3.429165,3.74686,2.446169],[3.074579,3.840758,2.767409],[3.569443,3.166337,2.333647],[2.294337,3.280051,3.359346],[2.21816,3.66578,3.269222],[2.158662,4.151444,-1.357919],[1.13862,4.380986,-1.404565],[3.388382,2.749931,-0.840949],[3.059892,5.084848,2.026066],[3.204739,2.075145,2.640706],[3.387065,1.42617,2.305275],[3.910398,2.670742,1.750179],[3.471512,1.945821,2.395881],[4.08082,1.070654,1.960171],[-1.057861,0.133036,2.146707],[-0.151749,5.53551,-0.624323],[3.233099,4.003778,2.571172],[2.611726,5.319199,-0.499388],[2.682909,1.094499,-1.206247],[-1.22823,7.656887,0.041409],[-2.293247,7.259189,0.013844],[0.081315,0.202174,3.286381],[-1.002038,5.794454,-0.187194],[3.448856,4.08091,2.258325],[0.287883,9.006888,-1.550641],[-3.851019,4.059839,-0.646922],[3.610966,4.205438,1.913129],[2.239042,2.950872,3.449959],[0.216305,0.442843,3.328052],[1.87141,2.470745,3.574559],[3.811378,2.768718,-0.228364],[2.511081,1.362724,2.969349],[-1.59813,7.866506,0.440184],[-3.307975,2.851072,-0.894978],[-0.107011,8.90573,-0.884399],[-3.855315,2.842597,-0.434541],[2.517853,1.090768,2.799687],[3.791709,2.36685,2.002703],[4.06294,2.773922,0.452723],[-2.973289,7.61703,-0.623653],[-2.95509,8.924462,-3.446319],[2.861402,0.562592,2.184397],[-1.109725,8.594206,-0.076812],[-0.725722,7.924485,-0.381133],[-1.485587,1.329994,-0.654405],[-4.342113,3.233735,1.752922],[-2.968049,7.955519,-2.09405],[-3.130948,0.446196,0.85287],[-4.958475,5.757329,1.447055],[-3.086547,7.615193,-1.953168],[-3.751923,5.412821,3.373373],[-4.599645,7.480953,1.677134],[1.133992,0.274871,0.032249],[-2.956512,8.126905,-1.785461],[-0.960645,4.73065,-1.191786],[-2.871064,0.875559,0.424881],[-4.932114,5.99614,1.483845],[-2.981761,8.124612,-1.387276],[0.362298,8.978545,-1.368024],[-4.408375,3.046271,0.602373],[2.865841,2.322263,-1.344625],[-4.7848,5.620895,0.594432],[-2.88322,0.338931,1.67231],[-4.688101,6.772931,1.872318],[-4.903948,6.164698,1.27135],[2.85663,1.005647,-0.906843],[2.691286,0.209811,0.050512],[-4.693636,6.477556,0.665796],[-4.472331,6.861067,0.477318],[0.883065,0.204907,3.073933],[-0.995867,8.048729,-0.653897],[-0.794663,5.670397,-0.390119],[3.313153,1.638006,-0.722289],[-4.856459,5.394758,1.032591],[-3.005448,7.783023,-0.819641],[3.11891,2.036974,-1.08689],[-2.364319,2.408419,2.63419],[-2.927132,8.75435,-3.537159],[-3.296222,7.964629,-3.134625],[-1.642041,4.13417,-1.301665],[2.030759,0.176372,-1.030923],[-4.559069,3.751053,0.548453],[3.438385,4.59454,-0.243215],[-2.561769,7.93935,0.177696],[2.990593,1.335314,-0.943177],[1.2808,0.276396,-0.49072],[-0.318889,0.290684,0.211143],[3.54614,3.342635,-0.767878],[-3.073372,7.780018,-2.357807],[-4.455388,4.387245,0.361038],[-4.659393,6.276064,2.767014],[0.636799,4.482223,-1.426284],[-2.987681,8.072969,-2.45245],[-2.610445,0.763554,1.792054],[3.358241,2.006707,-0.802973],[-0.498347,0.251594,0.962885],[3.1322,0.683312,2.038777],[-4.389801,7.493776,0.690247],[0.431467,4.22119,-1.614215],[-4.376181,3.213141,0.273255],[-4.872319,5.715645,0.829714],[-4.826893,6.195334,0.849912],[3.516562,2.23732,-0.677597],[3.131656,1.698841,-0.975761],[-4.754925,5.411666,1.989303],[-2.987299,7.320765,-0.629479],[-3.757635,3.274862,-0.744022],[3.487044,2.541999,-0.699933],[-4.53274,4.649505,0.77093],[-1.424192,0.099423,2.633327],[3.090867,2.476975,-1.146957],[-2.713256,0.815622,2.17311],[3.348121,3.254167,-0.984896],[-3.031379,0.16453,-0.309937],[-0.949757,4.518137,-1.309172],[-0.889509,0.095256,1.288803],[3.539594,1.966105,-0.553965],[-4.60612,7.127749,0.811958],[-2.332953,1.444713,1.624548],[3.136293,2.95805,-1.138272],[3.540808,3.069058,-0.735285],[3.678852,2.362375,-0.452543],[-4.648898,7.37438,0.954791],[-0.646871,0.19037,3.344746],[2.2825,0.29343,-0.826273],[-4.422291,7.183959,0.557517],[-4.694668,5.246103,2.541768],[-4.583691,4.145486,0.600207],[-2.934854,7.912513,-1.539269],[-3.067861,7.817472,-0.546501],[3.825095,3.229512,-0.237547],[2.532494,0.323059,2.387105],[-2.514583,0.692857,1.23597],[-4.736805,7.214384,1.259421],[-2.98071,8.409903,-2.468199],[2.621468,1.385844,-1.406355],[3.811447,3.560855,1.847828],[3.432925,1.497205,-0.489784],[3.746609,3.631538,-0.39067],[3.594909,2.832257,-0.576012],[-0.404192,5.300188,-0.856561],[-4.762996,6.483774,1.702648],[-4.756612,6.786223,1.43682],[-2.965309,8.437217,-2.785495],[2.863867,0.74087,-0.429684],[4.02503,2.968753,1.392419],[3.669036,1.833858,-0.304971],[-2.888864,0.720537,0.778057],[-2.36982,0.979443,1.054447],[-2.959259,8.222303,-2.659724],[-3.467825,7.545739,-2.333445],[2.153426,0.446256,-1.20523],[-3.229807,9.189699,-3.596609],[-3.72486,8.773707,-2.046671],[3.687218,3.297751,-0.523746],[1.381025,0.08815,-1.185668],[-2.796828,7.205622,-0.208783],[3.647194,4.066232,-0.291507],[-4.578376,3.885556,1.52546],[-2.840262,0.63094,1.89499],[-2.429514,0.922118,1.820781],[-4.675079,6.573925,2.423363],[2.806207,4.320188,-1.027372],[-1.289608,0.097241,1.321661],[-3.010731,8.141334,-2.866148],[3.202291,1.235617,-0.549025],[4.094792,2.477519,0.304581],[2.948403,0.966873,-0.664857],[-4.83297,5.920587,2.095461],[-2.169693,7.257277,0.946184],[-1.335807,3.057597,-1.303166],[-1.037877,0.64151,-1.685271],[2.627919,0.089814,0.439074],[3.815794,3.808102,1.730493],[-2.973455,8.433141,-3.08872],[-2.391558,7.331428,1.658264],[-4.333107,4.529978,1.850516],[-4.640293,3.767107,1.168841],[3.600716,4.46931,1.734024],[3.880803,1.730158,-0.172736],[3.814183,4.262372,1.167042],[4.37325,0.829542,1.413729],[2.490447,5.75111,0.011492],[3.460003,4.962436,1.188971],[3.918419,3.814234,1.358271],[-0.807595,8.840504,-0.953711],[3.752855,4.20577,1.57177],[-2.991085,8.816501,-3.244595],[-2.333196,7.128889,1.551985],[3.977718,3.570941,1.25937],[4.360071,0.755579,1.079916],[4.637579,1.027973,1.032567],[-2.317,7.421066,1.329589],[-1.013404,8.293662,-0.7823],[4.548023,1.020644,1.420462],[4.763258,1.266798,1.296203],[4.896,2.073084,1.255213],[4.015005,3.325226,1.093879],[4.94885,1.860936,0.894463],[-2.189645,6.954634,1.270077],[4.887442,1.720992,1.288526],[-3.184068,7.871802,0.956189],[-1.274318,0.839887,-1.224389],[-2.919521,7.84432,0.541629],[-2.994586,7.766102,1.96867],[-3.417504,9.241714,-3.093201],[-3.174563,7.466456,2.473617],[-3.263067,9.069412,-3.003459],[-2.841592,0.529833,2.693434],[-3.611069,9.158804,-2.829871],[-4.642828,5.927526,0.320549],[-3.809308,9.051035,-2.692749],[-2.837582,7.487987,-0.106206],[4.773025,2.330442,1.213899],[4.897435,2.209906,0.966657],[-3.067637,8.164062,-1.12661],[-3.122129,8.08074,-0.899194],[4.571019,2.358113,1.462054],[4.584884,2.454418,0.709466],[-3.661093,7.146581,-0.475948],[4.735131,2.415859,0.933939],[4.207556,2.540018,1.218293],[-3.607595,7.89161,-0.121172],[-1.527952,0.775564,-1.061903],[4.53874,2.503273,1.099583],[-3.938837,7.587988,0.082449],[-4.853582,6.152409,1.787943],[-4.752214,6.247234,2.296873],[4.602935,2.363955,0.488901],[-1.81638,6.365879,0.868272],[0.595467,4.744074,-1.32483],[1.87635,3.511986,-1.842924],[4.330947,2.534326,0.720503],[4.108736,2.750805,0.904552],[-1.890939,8.492628,-0.290768],[-3.504309,6.173058,-0.422804],[-1.611992,6.196732,0.648736],[-3.899149,7.826123,1.088845],[-3.078303,3.008813,-1.035784],[-2.798999,7.844899,1.340061],[-1.248839,5.959105,0.041761],[0.767779,4.337318,3.090817],[-3.831177,7.515605,2.432261],[-1.667528,6.156208,0.365267],[-1.726078,6.237384,1.100059],[-3.972037,4.520832,-0.370756],[-4.40449,7.636357,1.520425],[-1.34506,6.004054,1.293159],[-1.233556,6.049933,0.500651],[-3.696869,7.79732,0.37979],[-3.307798,8.949964,-2.698113],[-1.997295,6.615056,1.103691],[-3.219222,8.336394,-1.150614],[-3.452623,8.31866,-0.9417],[-3.94641,2.990494,2.212592],[-3.250025,8.030414,-0.596097],[-2.02375,1.571333,2.397939],[-3.190358,7.665013,2.268183],[-2.811918,7.618526,2.145587],[-1.005265,5.892303,0.072158],[-0.93721,5.974148,0.906669],[-4.646072,7.492193,1.45312],[-0.252931,1.797654,3.140638],[-1.076064,5.738433,1.695953],[-3.980534,7.744391,1.735791],[-0.721187,5.939396,0.526032],[-0.42818,5.919755,0.229001],[-1.43429,6.11622,0.93863],[-0.985638,5.939683,0.290636],[-4.433836,7.461372,1.966437],[-3.696398,7.844859,1.547325],[-3.390772,7.820186,1.812204],[-2.916787,7.864019,0.804341],[-3.715952,8.037269,-0.591341],[-4.204634,7.72919,1.119866],[-4.592233,5.592883,0.246264],[3.307299,5.061701,1.622917],[-3.515159,7.601467,2.368914],[-3.435742,8.533457,-1.37916],[-0.269421,4.545635,-1.366445],[-2.542124,3.768736,-1.258512],[-3.034003,7.873773,1.256854],[-2.801399,7.856028,1.080137],[3.29354,5.220894,1.081767],[-2.35109,1.299486,1.01206],[-3.232213,7.768136,2.047563],[3.290415,5.217525,0.68019],[-3.415109,7.731034,2.144326],[3.440357,4.962463,0.373387],[3.147346,5.352121,1.386923],[2.847252,5.469051,1.831981],[3.137682,5.410222,1.050188],[3.102694,5.310456,1.676434],[-3.044601,0.39515,1.994084],[2.903647,5.561338,1.518598],[-3.810148,8.093598,-0.889131],[4.234835,0.803054,1.593271],[3.240165,5.228747,0.325955],[3.037452,5.509825,0.817137],[2.635031,5.795187,1.439724],[3.071607,5.318303,0.080142],[2.909167,5.611751,1.155874],[3.044889,5.465928,0.486566],[2.502256,5.770673,1.740054],[-0.067497,0.086416,-1.190239],[2.33326,5.906051,0.138295],[0.65096,4.205423,3.308767],[-2.671137,7.936535,0.432731],[2.14463,5.879214,1.866047],[-4.776469,5.890689,0.561986],[2.72432,5.655145,0.211951],[2.730488,5.751455,0.695894],[2.572682,5.869295,1.152663],[1.906776,5.739123,2.196551],[2.344414,5.999961,0.772922],[-3.377905,7.448708,-1.863251],[2.285149,5.968156,1.459258],[2.385989,5.928974,0.3689],[2.192111,6.087516,0.959901],[2.36372,6.001101,1.074346],[1.972022,6.079603,1.591175],[1.87615,5.976698,1.91554],[-3.824761,9.05372,-2.928615],[2.044704,6.129704,1.263111],[-2.583046,0.849537,2.497344],[-0.078825,2.342205,3.520322],[-0.704686,0.537165,3.397194],[-0.257449,3.235334,3.647545],[-0.332064,1.448284,3.022583],[-2.200146,0.898284,-0.447212],[-2.497508,1.745446,1.829167],[0.30702,4.416315,2.978956],[-3.205197,3.479307,-1.040582],[0.110069,9.347725,-1.563686],[-0.82754,0.883886,3.065838],[-2.017103,1.244785,2.42512],[-0.421091,2.309929,3.153898],[-0.491604,3.796072,3.16245],[2.786955,3.501241,-1.340214],[-3.229055,4.380713,-0.899241],[3.730768,0.76845,1.90312],[-0.561079,2.652382,3.152463],[-3.461471,3.086496,2.662505],[-0.661405,3.446009,3.179939],[-0.915351,0.636755,3.243708],[-2.992964,8.915628,-3.729833],[-0.439627,3.502104,3.42665],[-1.154217,0.883181,2.800835],[-1.736193,1.465474,2.595489],[-0.423928,3.24435,3.548277],[-0.511153,2.871046,3.379749],[-0.675722,2.991756,3.143262],[-1.092602,0.599103,3.090639],[-0.89821,2.836952,2.840023],[-2.658412,0.781376,0.960575],[-2.271455,1.222857,1.330478],[-0.877861,1.111222,2.72263],[-0.306959,2.876987,3.556044],[-3.839274,7.84138,-0.918404],[-0.172094,4.083799,3.141708],[-1.548332,0.2529,2.864655],[-0.217353,4.873911,-1.223104],[-3.384242,3.181056,-0.95579],[-2.731704,0.382421,2.895502],[-1.285037,0.551267,2.947675],[0.077224,4.246579,3.066738],[-0.479979,1.77955,2.860011],[-0.716375,1.224694,2.666751],[-0.54622,3.138255,3.393457],[-2.33413,1.821222,2.124883],[-0.50653,2.037147,2.897465],[2.451291,1.211389,-1.466589],[-3.160047,2.894081,2.724286],[-4.137258,5.433431,3.21201],[0.462896,0.320456,-0.174837],[-0.37458,2.609447,3.379253],[-3.095244,0.256205,2.196446],[-4.197985,5.732991,3.262924],[-0.729747,0.246036,0.497036],[-2.356189,5.062,-0.965619],[-1.609036,0.25962,-1.487367],[-4.074381,6.074061,3.409459],[-3.619304,4.0022,2.65705],[-0.543393,8.742896,-1.056622],[-4.30356,6.858934,2.879642],[-0.716688,2.901831,-2.11202],[1.547362,0.083189,1.138764],[-0.250916,0.275268,1.201344],[-3.778035,3.13624,2.466177],[-4.594316,5.771342,3.01694],[-3.717706,3.442887,2.603344],[-4.311163,5.224669,3.019373],[-0.610389,2.095161,-1.923515],[-3.040086,6.196918,-0.429149],[-3.802695,3.768247,2.545523],[-0.159541,2.043362,3.328549],[-3.744329,4.31785,2.491889],[-3.047939,0.214155,1.873639],[-4.41685,6.113058,3.166774],[-1.165133,0.460692,-1.742134],[-1.371289,4.249996,-1.317935],[-3.447883,0.3521,0.466205],[-4.495555,6.465548,2.944147],[-3.455335,0.171653,0.390816],[-3.964028,4.017196,2.376009],[-1.323595,1.763126,-0.750772],[-3.971142,5.277524,-0.19496],[-3.222052,0.237723,0.872229],[-4.403784,3.89107,1.872077],[-3.333311,0.342997,0.661016],[-4.495871,4.29606,1.63608],[-3.636081,2.760711,2.361949],[-4.487235,3.559608,1.66737],[-4.719787,7.26888,1.658722],[-1.086143,9.035741,-0.707144],[-2.339693,1.600485,-0.404817],[-4.642011,7.123829,1.990987],[-1.498077,3.854035,-1.369787],[-4.188372,4.729363,2.02983],[-3.116344,5.882284,-0.468884],[-4.305236,4.246417,1.976991],[-3.022509,0.22819,1.065688],[-2.799916,0.52022,1.128319],[-4.262823,3.534409,2.020383],[-4.221533,3.947676,2.11735],[-3.744353,4.391712,-0.6193],[-1.272905,0.156694,-1.741753],[-3.62491,2.669825,-0.549664],[-4.180756,3.096179,1.987215],[-4.059276,4.305313,2.232924],[-2.812753,0.183226,1.370267],[-4.032437,3.512234,2.309985],[-0.03787,0.28188,0.530391],[-4.711562,5.468653,2.822838],[-4.500636,6.953314,2.564445],[-4.479433,7.216991,2.270682],[3.990562,0.50522,0.716309],[-2.512229,6.863447,-0.100658],[-2.968058,6.956639,-0.37061],[2.550375,3.142683,-1.54068],[-2.320059,3.521605,-1.279397],[-4.556319,6.64662,2.745363],[-4.281091,7.108116,2.667598],[-2.050095,8.411689,0.121353],[-2.44854,1.135487,0.851875],[3.121815,0.699943,-0.277167],[-4.69877,6.00376,2.843035],[-1.360599,8.824742,-0.595597],[1.128437,0.171611,0.301691],[-4.360146,6.289423,0.042233],[1.400795,4.088829,-1.620409],[-3.193462,8.460137,-3.559446],[-3.168771,8.878431,-3.635795],[-3.434275,9.304302,-3.460878],[-3.349993,8.808093,-3.38179],[-3.304823,8.323865,-3.325905],[-3.572607,9.308843,-3.207672],[-3.166393,8.201215,-3.43014],[-3.451638,9.05331,-3.351345],[-3.309591,8.549758,-3.375055],[-3.527992,8.793926,-3.100376],[-3.6287,8.981677,-3.076319],[-3.445505,8.001887,-2.8273],[-3.408011,8.221014,-3.039237],[-3.65928,8.740382,-2.808856],[-3.878019,8.797295,-2.462866],[-3.515132,8.232341,-2.747739],[-3.460331,8.51524,-3.06818],[-3.403703,7.658628,-2.648789],[-3.507113,8.00159,-2.582275],[-3.607373,8.174737,-2.401723],[-3.749043,8.378084,-2.226959],[-3.648514,8.502213,-2.6138],[-2.534199,0.904753,2.021148],[1.4083,5.744252,-0.571402],[-3.852536,8.571009,-2.352358],[2.868255,5.373126,-0.163705],[2.224363,4.669891,-1.061586],[-4.528281,4.885838,1.340274],[1.30817,4.609629,-1.28762],[-4.519698,3.422501,1.354826],[-3.549955,7.783228,-2.332859],[1.12313,6.120856,0.045115],[-3.620324,7.57716,-2.033423],[-0.798833,2.624133,-1.992682],[-3.617587,7.783148,-2.051383],[-3.669293,8.103776,-2.10227],[-3.892417,8.667436,-2.167288],[-0.537435,0.285345,-0.176267],[-0.841522,3.299866,-1.887861],[-0.761547,3.647082,-1.798953],[-3.661544,7.85708,-1.867924],[-3.886763,8.551783,-1.889171],[-0.591244,1.549749,-1.714784],[-0.775276,1.908218,-1.597609],[-0.961458,2.573273,-1.695549],[-2.215672,1.335009,2.143031],[-4.622674,4.130242,1.220683],[1.07344,0.290099,1.584734],[-0.976906,2.92171,-1.76667],[-1.13696,3.194401,-1.513455],[-3.743262,7.99949,-1.629286],[-2.876359,4.900986,-0.879556],[0.550835,3.905557,-2.031372],[0.777647,4.992314,-1.215703],[1.445881,4.266201,-1.414663],[1.274222,5.510543,-0.824495],[-0.864685,2.318581,-1.702389],[-0.627458,3.820722,-1.743153],[-3.867699,8.30866,-1.850066],[1.635287,5.45587,-0.83844],[-1.037876,2.538589,-1.513504],[-4.38993,4.73926,1.699639],[0.048709,4.765232,-1.279506],[-0.626548,1.339887,-1.595114],[-3.682827,7.643453,-1.723398],[-3.868783,8.180191,-1.511743],[-0.76988,1.508373,-1.419599],[-1.138374,2.766765,-1.448163],[1.699883,5.780752,-0.475361],[1.214305,0.308517,1.866405],[-1.713642,0.373461,-1.265204],[-1.582388,0.58294,-1.267977],[-0.879549,1.821581,-1.313787],[0.519057,5.858757,-0.381397],[-3.770989,2.449208,-0.132655],[0.087576,0.156713,-1.53616],[-0.942622,2.146534,-1.421494],[-1.026192,1.022164,-1.145423],[-0.964079,1.645473,-1.067631],[-1.109128,2.458789,-1.29106],[-1.037478,0.209489,-1.805424],[-3.724391,7.599686,-1.273458],[-3.787898,7.951792,-1.304794],[3.821677,2.165581,-0.181535],[-2.39467,0.304606,-0.570375],[-2.352928,1.0439,2.079369],[-0.288899,9.640684,-1.006079],[-3.472118,7.263001,-1.080326],[-1.240769,0.972352,-0.976446],[-1.845253,0.356801,-0.995574],[-2.32279,7.915361,-0.057477],[-1.08092,2.179315,-1.168821],[4.598833,2.156768,0.280264],[-4.725417,6.442373,2.056809],[-0.490347,9.46429,-0.981092],[-1.99652,0.09737,-0.765828],[-1.137793,1.888846,-0.894165],[-0.37247,4.29661,-1.465199],[-0.184631,5.692946,-0.421398],[-3.751694,7.742231,-1.086908],[-1.001416,1.298225,-0.904674],[-3.536884,7.190777,-0.788609],[-3.737597,7.511281,-0.940052],[-1.766651,0.669388,-0.873054],[3.112245,3.474345,-1.129672],[-0.175504,3.81298,-2.0479],[-3.766762,7.412514,-0.681569],[-0.63375,9.439424,-0.785128],[-0.518199,4.768982,-1.258625],[0.790619,4.212759,-1.610218],[-3.761951,3.742528,-0.756283],[0.897483,5.679808,-0.612423],[2.221126,4.427468,-1.252155],[-0.728577,5.846457,0.062702],[0.194451,9.503908,-1.482461],[-0.099243,9.385459,-1.39564],[0.643185,3.636855,-2.180247],[0.894522,5.900601,-0.356935],[2.595516,4.75731,-0.893245],[1.108497,3.936893,-1.905098],[1.989894,5.789726,-0.343268],[-3.802345,7.655508,-0.613817],[2.339353,4.96257,-0.90308],[0.12564,4.013324,-1.879236],[-4.078965,3.683254,-0.445439],[2.092899,5.256128,-0.831607],[0.427571,0.291769,1.272964],[2.335549,3.480056,-1.581949],[-0.15687,0.324827,-1.648922],[-0.536522,5.760786,-0.203535],[1.507082,0.078251,-0.923109],[-1.854742,0.134826,2.698774],[-3.939827,3.168498,-0.526144],[-3.98461,3.39869,-0.533212],[-3.961738,4.217132,-0.489147],[4.273789,2.181164,0.153786],[-0.470498,5.645664,-0.439079],[-0.414539,5.488017,-0.673379],[-0.097462,5.062739,-1.114863],[1.198092,5.882232,-0.391699],[2.855834,5.085022,-0.498678],[1.037998,4.129757,-1.701811],[1.728091,5.068444,-1.063761],[-3.832258,2.625141,-0.311384],[-4.078526,3.070256,-0.284362],[-4.080365,3.954243,-0.440471],[-0.152578,5.276267,-0.929815],[-1.489635,8.928082,-0.295891],[0.759294,5.15585,-1.087374],[-4.000338,2.801647,-0.235135],[-4.290801,3.823209,-0.19374],[-4.221493,4.25618,-0.189894],[-4.066195,4.71916,-0.201724],[-0.155386,4.076396,-1.662865],[3.054571,4.414305,-0.825985],[-1.652919,8.726499,-0.388504],[-3.042753,0.560068,-0.126425],[-2.434456,1.118088,-0.213563],[-2.623502,1.845062,-0.283697],[-4.233371,3.43941,-0.202918],[2.726702,3.82071,-1.280097],[0.184199,4.14639,-1.673653],[-1.289203,0.624562,-1.560929],[-3.823676,7.382458,-0.407223],[0.476667,5.064419,-1.143742],[-3.873651,4.955112,-0.269389],[1.349666,5.312227,-1.000274],[-2.043776,8.434488,-0.108891],[-2.763964,0.733395,-0.129294],[-4.380505,3.664409,-0.024546],[-0.71211,5.341811,-0.803281],[-3.960858,7.183112,-0.118407],[-3.822277,7.712853,-0.263221],[-2.346808,8.108588,0.063244],[-1.841731,8.642999,-0.142496],[-2.600055,0.985604,-0.043595],[-3.513057,2.213243,-0.044151],[-3.963492,2.603055,-0.080898],[-4.258066,3.14537,-0.027046],[-4.261572,5.00334,0.13004],[0.795464,3.99873,-1.905688],[-3.300873,0.384761,0.013271],[-2.770244,0.881942,0.077313],[-3.456227,1.993871,0.301054],[-4.441987,3.914144,0.177867],[-4.367075,6.611414,0.165312],[-3.201767,0.576292,0.105769],[-3.174354,0.645009,0.440373],[-2.996576,0.74262,0.161325],[-2.724979,1.656497,0.092983],[-3.261757,2.017742,-0.070763],[-4.280173,4.518235,-0.002999],[-4.471073,5.945358,0.05202],[-3.877137,2.40743,0.274928],[-4.371219,4.252758,0.078039],[-3.400914,0.40983,0.238599],[-4.44293,3.523242,0.146339],[-4.574528,5.279761,0.353923],[-4.226643,7.191282,0.269256],[-4.16361,2.843204,0.097727],[-4.528506,5.011661,0.536625],[0.35514,5.664802,-0.572814],[2.508711,5.580976,-0.266636],[2.556226,3.633779,-1.426362],[1.878456,4.533714,-1.223744],[2.460709,4.440241,-1.1395],[2.218589,5.514603,-0.560066],[2.263712,5.737023,-0.250694],[2.964981,3.814858,-1.139927],[0.991384,5.304131,-0.999867],[2.81187,4.547292,-0.916025],[2.918089,4.768382,-0.702808],[3.262403,4.414286,-0.657935],[0.652136,6.089113,0.069089],[3.361389,3.5052,-0.946123],[2.613042,5.037192,-0.697153],[0.094339,4.36858,-1.451238],[3.290862,4.155716,-0.732318],[2.658063,4.073614,-1.217455],[3.260349,3.753257,-0.946819],[1.124268,4.862463,-1.207855],[3.35158,4.899247,-0.027586],[3.194057,4.691257,-0.524566],[3.090119,5.116085,-0.23255],[2.418965,3.811753,-1.419399],[2.191789,3.877038,-1.47023],[4.043166,2.034188,0.015477],[-1.026966,0.86766,-1.410912],[1.937563,3.860005,-1.617465],[2.98904,4.101806,-0.998132],[-0.142611,5.865305,-0.100872],[3.972673,2.292069,0.089463],[3.23349,3.959925,-0.849829],[0.16304,5.857276,-0.216704],[4.122964,1.770061,-0.114906],[2.099057,4.978374,-0.98449],[3.502411,3.76181,-0.667502],[2.079484,5.939614,-0.036205],[-0.084568,3.525193,-2.253506],[0.423859,4.06095,-1.845327],[1.6013,6.006466,-0.153429],[0.271701,3.844964,-2.078748],[0.273577,5.218904,-0.994711],[-0.410578,3.92165,-1.773635],[1.941954,5.60041,-0.621569],[0.100825,5.462131,-0.774256],[-0.53016,3.619892,-2.027451],[-0.822371,5.517453,-0.605747],[-2.474925,7.670892,-0.020174],[4.01571,0.830194,-0.013793],[-0.400092,5.094112,-1.041992],[-2.887284,5.581246,-0.525324],[-1.559841,6.050972,0.079301],[-0.469317,3.291673,-2.235211],[0.337397,3.467926,-2.295458],[-2.632074,5.573701,-0.582717],[-0.030318,6.011395,0.276616],[-0.934373,0.388987,-1.780523],[-2.661263,5.844838,-0.425966],[0.549353,5.489646,-0.807268],[-2.194355,6.197491,-0.109322],[-2.289618,5.664813,-0.581098],[1.583583,3.796366,-1.844498],[0.855295,0.215979,-1.425557],[-2.627569,5.300236,-0.767174],[4.333347,2.384332,0.399129],[-1.880401,5.583843,-0.696561],[-2.172346,5.324859,-0.846246],[-2.27058,5.906265,-0.388373],[-1.960049,5.889346,-0.397593],[0.965756,3.67547,-2.105671],[-2.014066,6.431125,0.287254],[-1.776173,5.287097,-0.89091],[-2.025852,5.089562,-0.980218],[-1.886418,6.108358,-0.000667],[-1.600803,5.785347,-0.491069],[-1.66188,4.968053,-1.042535],[-1.600621,5.962818,-0.188044],[-1.588831,5.615418,-0.665456],[4.46901,1.880138,0.057248],[-1.978845,0.927399,-0.554856],[-1.408074,5.325266,-0.83967],[1.923123,4.843955,-1.101389],[-2.87378,0.117106,-0.412735],[-1.222193,5.62638,-0.539981],[-2.632537,0.166349,-0.489218],[-1.370865,5.838832,-0.341026],[-1.067742,5.448874,-0.692701],[-1.073798,5.220878,-0.908779],[-1.147562,4.950417,-1.079727],[-2.789115,4.531047,-1.042713],[-3.550826,4.170487,-0.806058],[-3.331694,4.798177,-0.69568],[-3.689404,4.688543,-0.534317],[-3.511509,5.106246,-0.483632],[1.796344,0.076137,0.080455],[-3.306354,5.473605,-0.478764],[-2.692503,3.346604,-1.20959],[-3.963056,5.187462,3.113156],[-3.901231,6.391477,-0.246984],[4.484234,1.518638,-0.001617],[4.308829,1.657716,-0.119275],[4.290045,1.339528,-0.110626],[-3.514938,3.524974,-0.909109],[-2.1943,2.12163,-0.71966],[4.108206,1.091087,-0.11416],[3.785312,1.392435,-0.28588],[4.092886,1.480476,-0.210655],[-2.965937,6.469006,-0.379085],[-3.708581,2.962974,-0.63979],[-3.297971,2.218917,-0.299872],[3.806949,0.804703,-0.11438],[3.747957,1.059258,-0.273069],[-3.101827,4.111444,-1.006255],[-1.536445,4.658913,-1.195049],[-3.549826,2.450555,-0.375694],[-3.676495,2.108366,0.534323],[-3.674738,5.925075,-0.400011],[-2.250115,2.848335,-1.121174],[-3.698062,5.667567,-0.381396],[3.468966,0.734643,-0.190624],[-3.97972,5.670078,-0.26874],[-3.002087,4.337837,-1.033421],[-3.356392,2.608308,-0.713323],[-1.833016,3.359983,-1.28775],[-1.989069,3.632416,-1.305607],[3.591254,0.542371,0.026146],[3.364927,1.082572,-0.342613],[-3.393759,3.866801,-0.937266],[-4.124865,5.549529,-0.161729],[-4.423423,5.687223,0.000103],[-1.496881,2.601785,-1.114328],[-2.642297,6.496932,-0.264175],[-3.684236,6.819423,-0.320233],[-2.286996,3.167067,-1.246651],[-1.624896,8.44848,-0.530014],[-3.666787,2.159266,0.268149],[-2.402625,2.011243,-0.56446],[-2.736166,2.259839,-0.6943],[-2.168611,3.89078,-1.292206],[-2.065956,3.345708,-1.281346],[-2.778147,2.675605,-0.995706],[-3.507431,4.513272,-0.71829],[-2.301184,4.293911,-1.238182],[3.205808,0.211078,0.394349],[-2.129936,4.870577,-1.080781],[-2.287977,2.496593,-0.934069],[-2.701833,2.931814,-1.114509],[3.294795,0.50631,-0.081062],[-2.552829,7.468771,-0.021541],[3.06721,0.944066,-0.43074],[-2.86086,1.973622,-0.303132],[-3.598818,5.419613,-0.401645],[-1.524381,0.080156,-1.61662],[-1.907291,2.646274,-1.039438],[2.950783,0.407562,-0.105407],[-1.663048,1.655038,-0.689787],[-1.728102,1.110064,-0.635963],[-2.085823,7.686296,-0.159745],[2.883518,3.157009,-1.30858],[-2.724116,0.417169,-0.389719],[-1.788636,7.862672,-0.346413],[-2.186418,1.249609,-0.434583],[-3.092434,2.606657,-0.860002],[-1.737314,3.874201,-1.330986],[2.564522,0.422967,-0.390903],[1.670782,3.538432,-1.924753],[-2.338131,4.02578,-1.286673],[-1.916516,4.054121,-1.301788],[2.87159,2.034949,-1.267139],[-1.931518,3.062883,-1.197227],[-0.816602,0.135682,3.104104],[0.469392,0.213916,-1.489608],[2.574055,1.950091,-1.514427],[2.733595,2.682546,-1.461213],[-1.915407,4.693647,-1.151721],[-3.412883,5.867094,-0.450528],[2.28822,0.120432,-0.04102],[2.244477,0.14424,-0.376933],[-1.676198,3.570698,-1.328031],[-1.821193,4.366982,-1.266271],[-1.552208,8.099221,-0.53262],[-1.727419,2.39097,-0.989456],[-2.468226,4.711663,-1.069766],[-2.451669,6.113319,-0.273788],[2.635447,2.295842,-1.518361],[-2.020809,8.150253,-0.246714],[2.292455,0.805596,-1.3042],[2.641556,1.65665,-1.466962],[2.409062,2.842538,-1.635025],[2.456682,1.459484,-1.57543],[-1.691047,3.173582,-1.247082],[-1.865642,1.957608,-0.768683],[-3.401579,0.20407,0.100932],[2.301981,1.7102,-1.650461],[2.342929,2.611944,-1.690713],[-1.676111,2.923894,-1.17835],[-2.992039,3.547631,-1.118945],[-3.571677,6.504634,-0.375455],[2.141764,1.460869,-1.702464],[-3.221958,5.146049,-0.615632],[2.19238,2.949367,-1.747242],[2.320791,2.232971,-1.706842],[2.088678,2.585235,-1.813159],[-2.196404,0.592218,-0.569709],[-2.120811,1.836483,-0.62338],[-1.949935,2.271249,-0.874128],[2.235901,1.110183,-1.510719],[2.020157,3.241128,-1.803917],[2.054336,1.949394,-1.792332],[-3.094117,4.996595,-0.740238],[2.038063,0.635949,-1.402041],[1.980644,1.684408,-1.76778],[1.587432,3.306542,-1.991131],[1.935322,0.976267,-1.602208],[1.922621,1.235522,-1.698813],[1.712495,1.911874,-1.903234],[1.912802,2.259273,-1.888698],[1.884367,0.355453,-1.312633],[1.676427,0.76283,-1.539455],[1.78453,2.83662,-1.943035],[1.697312,0.120281,-1.150324],[1.648318,2.484973,-1.999505],[-4.051804,5.958472,-0.231731],[-1.964823,1.464607,-0.58115],[1.55996,2.183486,-1.971378],[1.628125,1.045912,-1.707832],[1.701684,1.540428,-1.827156],[1.567475,4.869481,-1.184665],[1.432492,0.843779,-1.648083],[1.173837,2.978983,-2.156687],[1.235287,3.37975,-2.09515],[1.252589,1.525293,-1.949205],[1.159334,2.336379,-2.105361],[1.49061,2.695263,-2.083216],[-4.122486,6.782604,-0.02545],[1.173388,0.279193,-1.423418],[1.505684,0.380815,-1.414395],[1.391423,1.343031,-1.843557],[1.263449,2.73225,-2.144961],[1.295858,0.597122,-1.515628],[1.245851,3.729126,-1.993015],[-2.761439,6.23717,-0.365856],[0.978887,1.664888,-2.046633],[1.219542,0.982729,-1.785486],[1.315915,1.91748,-2.02788],[-3.052746,2.127222,-0.369082],[0.977656,1.36223,-1.944119],[0.936122,3.39447,-2.203007],[-2.740036,4.184702,-1.122849],[0.853581,2.864694,-2.260847],[0.719569,0.818762,-1.763618],[0.839115,1.159359,-1.907943],[0.932069,1.94559,-2.117962],[0.579321,3.326747,-2.299369],[0.86324,0.597822,-1.565106],[0.574567,1.158452,-1.943123],[0.525138,2.137252,-2.213867],[0.779941,2.342019,-2.206157],[0.915255,2.618102,-2.209041],[0.526426,3.02241,-2.321826],[0.495431,2.521396,-2.295905],[0.80799,3.156817,-2.286432],[0.273556,1.304936,-2.012509],[0.664326,1.530024,-2.048722],[0.219173,2.32907,-2.323212],[0.405324,0.695359,-1.704884],[0.398827,0.946649,-1.843899],[0.345109,1.608829,-2.100174],[-2.356743,0.062032,-0.4947],[-3.001084,0.27146,2.560034],[-2.064663,0.303055,-0.697324],[0.221271,3.174023,-2.374399],[0.195842,0.437865,-1.621473],[-0.385613,0.297763,1.960096],[1.999609,0.108928,-0.79125],[0.351698,9.227494,-1.57565],[0.021477,2.191913,-2.309353],[0.246381,2.836575,-2.356365],[1.543281,0.237539,1.901906],[0.031881,9.147022,-1.454203],[-0.001881,1.648503,-2.108044],[0.333423,1.907088,-2.204533],[0.044063,2.634032,-2.368412],[-0.028148,3.053684,-2.390082],[0.02413,3.34297,-2.36544],[-0.272645,9.02879,-1.238685],[-0.006348,0.832044,-1.758222],[-0.321105,1.458754,-1.886313],[-0.153948,8.618809,-1.105353],[-0.409303,1.137783,-1.720556],[-0.410054,1.742789,-1.957989],[-0.287905,2.380404,-2.294509],[-0.261375,2.646629,-2.356322],[-0.221986,3.215303,-2.345844],[-0.31608,0.687581,-1.71901],[-0.537705,0.855802,-1.648585],[-0.142834,1.193053,-1.87371],[-0.24371,2.044435,-2.176958],[-0.437999,2.959748,-2.299698],[-0.78895,0.176226,-1.729046],[-0.608509,0.546932,-1.734032],[-0.693698,4.478782,-1.369372],[-0.669153,8.469645,-0.911149],[-0.741857,1.082705,-1.458474],[-0.554059,2.440325,-2.141785],[2.09261,0.153182,2.57581],[1.792547,0.111794,2.563777],[1.855787,0.189541,2.835089],[1.492601,0.232246,2.987681],[-0.284918,0.236687,3.429738],[2.604841,0.11997,1.01506],[0.331271,0.168113,3.124031],[0.280606,0.308368,2.495937],[0.544591,0.325711,2.081274],[0.193145,0.19154,-0.977556],[3.810099,0.42324,1.032202],[3.54622,0.379245,1.392814],[0.61402,0.276328,0.849356],[-1.198628,0.144953,2.911457],[4.17199,0.68037,1.391526],[0.88279,0.321339,2.059129],[1.93035,0.109992,2.054154],[1.620331,0.121986,2.37203],[2.374812,0.10921,1.734876],[-0.031227,0.294412,2.593687],[4.075018,0.561914,1.038065],[-0.570366,0.126583,2.975558],[0.950052,0.318463,1.804012],[1.130034,0.117125,0.98385],[2.123049,0.08946,1.665911],[2.087572,0.068621,0.335013],[2.927337,0.167117,0.289611],[0.528876,0.313434,3.205969],[1.174911,0.162744,1.328262],[-4.88844,5.59535,1.661134],[-4.709607,5.165338,1.324082],[0.871199,0.277021,1.263831],[-3.910877,2.349318,1.272269],[1.56824,0.118605,2.768112],[1.179176,0.152617,-0.858003],[1.634629,0.247872,2.128625],[-4.627425,5.126935,1.617836],[3.845542,0.54907,1.45601],[2.654006,0.165508,1.637169],[-0.678324,0.26488,1.974741],[2.451139,0.100377,0.213768],[0.633199,0.286719,0.403357],[-0.533042,0.2524,1.373267],[0.99317,0.171106,0.624966],[-0.100063,0.306466,2.170225],[1.245943,0.092351,0.661031],[1.390414,0.198996,-0.0864],[-4.457265,5.030531,2.138242],[2.89776,0.146575,1.297468],[1.802703,0.088824,-0.490405],[1.055447,0.309261,2.392437],[2.300436,0.142429,2.104254],[2.33399,0.187756,2.416935],[2.325183,0.134349,0.574063],[2.410924,0.370971,2.637115],[1.132924,0.290511,3.061],[1.764028,0.070212,-0.80535],[2.156994,0.397657,2.844061],[0.920711,0.225527,-0.882456],[-4.552135,5.24096,2.85514],[0.210016,0.309396,2.064296],[0.612067,0.136815,-1.086002],[3.150236,0.426757,1.802703],[-0.24824,0.282258,1.470997],[0.974269,0.301311,-0.640898],[-4.401413,5.03966,2.535553],[0.644319,0.274006,-0.817806],[0.332922,0.309077,0.108474],[3.610001,0.317447,0.689353],[3.335681,0.358195,0.118477],[0.623544,0.318983,-0.4193],[-0.11012,0.307747,1.831331],[-0.407528,0.291044,2.282935],[0.069783,0.285095,0.950289],[0.970135,0.310392,-0.283742],[0.840564,0.306898,0.098854],[-0.541827,0.267753,1.683795],[-3.956082,4.55713,2.297164],[-4.161036,2.834481,1.64183],[-4.093952,4.977551,2.747747],[2.661819,0.261867,1.926145],[-3.749926,2.161875,0.895238],[-2.497776,1.3629,0.791855],[0.691482,0.304968,1.582939],[-4.013193,4.830963,2.4769],[-3.639585,2.091265,1.304415],[-3.9767,2.563053,1.6284],[-3.979915,2.788616,1.977977],[0.388782,0.312656,1.709168],[-3.40873,1.877324,0.851652],[-3.671637,5.136974,3.170734],[-3.12964,1.852012,0.157682],[-3.629687,4.852698,2.686837],[-3.196164,1.793459,0.452804],[-3.746338,2.31357,1.648551],[2.992192,0.125251,0.575976],[-3.254051,0.054431,0.314152],[-3.474644,1.925288,1.134116],[-3.418372,2.022882,1.578901],[-2.920955,1.705403,0.29842],[-3.57229,2.152022,1.607572],[-3.251259,0.09013,-0.106174],[-3.299952,1.877781,1.348623],[-3.666819,2.441459,2.004838],[-2.912646,1.824748,-0.045348],[-3.399511,2.479484,2.340393],[-3.009754,0.015286,0.075567],[-3.381443,2.316937,2.156923],[-3.352801,2.133341,1.857366],[-3.01788,1.687685,0.645867],[-2.931857,1.678712,1.158472],[-3.301008,0.08836,0.591001],[1.358025,0.19795,1.599144],[-2.999565,1.845016,1.618396],[-2.767957,0.028397,-0.196436],[-2.93962,2.078779,2.140593],[-3.346648,2.674056,2.518097],[3.324322,0.20822,0.628605],[3.091677,0.137202,0.9345],[-2.881807,0.009952,0.318439],[-2.764946,1.786619,1.693439],[-2.905542,1.932343,1.900002],[-3.140854,2.271384,2.274946],[-2.88995,2.487856,2.574759],[-2.367194,-0.000943,-0.15576],[-3.050738,0.068703,0.742988],[-2.759525,1.55679,0.877782],[-3.151775,2.48054,2.482749],[-2.578618,-0.002885,0.165716],[-2.651618,1.877246,1.981189],[-2.933973,0.133731,1.631023],[1.047628,0.100284,-1.085248],[-1.585123,0.062083,-1.394896],[-2.287917,-0.002671,0.214434],[-2.524899,0.007481,0.471788],[-2.815492,2.188198,2.343294],[-2.095142,-0.003149,-0.094574],[-2.172686,-0.000133,0.47963],[-2.732704,0.074306,1.742079],[-2.49653,2.145668,2.42691],[-1.343683,0.047721,-1.506391],[-2.581185,0.048703,0.975528],[-2.905101,0.083158,2.010052],[-2.601514,2.007801,2.223089],[-2.339464,0.02634,1.484304],[-2.907873,0.10367,2.378149],[-1.368796,0.062516,-1.049125],[-1.93244,0.02443,-0.427603],[-2.705081,0.060513,2.303802],[3.372155,0.206274,0.892293],[-1.761827,0.093202,-1.037404],[-1.700667,0.0397,-0.614221],[-1.872291,0.011979,-0.135753],[-1.929257,0.074005,0.728999],[-2.520128,0.049665,1.99054],[-2.699411,0.10092,2.603116],[3.211701,0.27302,1.423357],[-1.445362,0.1371,-0.626491],[2.921332,0.259112,1.645525],[-0.993242,0.058686,-1.408916],[-0.944986,0.157541,-1.097665],[-2.154301,0.032749,1.882001],[-2.108789,1.988557,2.442673],[-1.015659,0.25497,-0.416665],[-1.898411,0.015872,0.16715],[-1.585517,0.027121,0.453445],[-2.311105,0.061264,2.327061],[-2.637042,0.152224,2.832201],[-2.087515,2.292972,2.617585],[-0.750611,0.056697,-1.504516],[-0.472029,0.075654,-1.360203],[-0.710798,0.139244,-1.183863],[-0.97755,0.26052,-0.831167],[-0.655814,0.260843,-0.880068],[-0.897513,0.275537,-0.133042],[-2.049194,0.084947,2.455422],[-0.177837,0.076362,-1.449009],[-0.553393,0.279083,-0.59573],[-1.788636,0.06163,2.231198],[-0.34761,0.255578,-0.999614],[-1.398589,0.036482,0.65871],[-1.133918,0.05617,0.69473],[-1.43369,0.058226,1.977865],[-2.505459,1.492266,1.19295]]
exports.cells=[[2,1661,3],[1676,7,6],[712,1694,9],[3,1674,1662],[11,1672,0],[1705,0,1],[5,6,1674],[4,5,1674],[7,8,712],[2,1662,10],[1,10,1705],[11,1690,1672],[1705,11,0],[5,1676,6],[7,9,6],[7,712,9],[2,3,1662],[3,4,1674],[1,2,10],[12,82,1837],[1808,12,1799],[1808,1799,1796],[12,861,82],[861,1808,13],[1808,861,12],[1799,12,1816],[1680,14,1444],[15,17,16],[14,1678,1700],[16,17,1679],[15,1660,17],[14,1084,1678],[15,1708,18],[15,18,1660],[1680,1084,14],[1680,15,1084],[15,1680,1708],[793,813,119],[1076,793,119],[1076,1836,22],[23,19,20],[21,1076,22],[21,22,23],[23,20,21],[1076,119,1836],[806,634,470],[432,1349,806],[251,42,125],[809,1171,791],[953,631,827],[634,1210,1176],[157,1832,1834],[56,219,53],[126,38,83],[37,85,43],[59,1151,1154],[83,75,41],[77,85,138],[201,948,46],[1362,36,37],[452,775,885],[1237,95,104],[966,963,1262],[85,77,43],[36,85,37],[1018,439,1019],[41,225,481],[85,83,127],[93,83,41],[935,972,962],[116,93,100],[98,82,813],[41,75,225],[298,751,54],[1021,415,1018],[77,138,128],[766,823,1347],[593,121,573],[905,885,667],[786,744,747],[100,41,107],[604,334,765],[779,450,825],[968,962,969],[225,365,481],[365,283,196],[161,160,303],[875,399,158],[328,1817,954],[62,61,1079],[358,81,72],[74,211,133],[160,161,138],[91,62,1079],[167,56,1405],[56,167,219],[913,914,48],[344,57,102],[43,77,128],[1075,97,1079],[389,882,887],[219,108,53],[1242,859,120],[604,840,618],[754,87,762],[197,36,1362],[1439,88,1200],[1652,304,89],[81,44,940],[445,463,151],[717,520,92],[129,116,100],[1666,1811,624],[1079,97,91],[62,91,71],[688,898,526],[463,74,133],[278,826,99],[961,372,42],[799,94,1007],[100,93,41],[1314,943,1301],[184,230,109],[875,1195,231],[133,176,189],[751,755,826],[101,102,57],[1198,513,117],[748,518,97],[1145,1484,1304],[358,658,81],[971,672,993],[445,151,456],[252,621,122],[36,271,126],[85,36,126],[116,83,93],[141,171,1747],[1081,883,103],[1398,1454,149],[457,121,593],[127,116,303],[697,70,891],[457,891,1652],[1058,1668,112],[518,130,97],[214,319,131],[185,1451,1449],[463,133,516],[1428,123,177],[113,862,561],[215,248,136],[186,42,251],[127,83,116],[160,85,127],[162,129,140],[154,169,1080],[169,170,1080],[210,174,166],[1529,1492,1524],[450,875,231],[399,875,450],[171,141,170],[113,1155,452],[131,319,360],[44,175,904],[452,872,113],[746,754,407],[147,149,150],[309,390,1148],[53,186,283],[757,158,797],[303,129,162],[429,303,162],[154,168,169],[673,164,193],[38,271,75],[320,288,1022],[246,476,173],[175,548,904],[182,728,456],[199,170,169],[168,199,169],[199,171,170],[184,238,230],[246,247,180],[1496,1483,1467],[147,150,148],[828,472,445],[53,108,186],[56,53,271],[186,961,42],[1342,391,57],[1664,157,1834],[1070,204,178],[178,204,179],[285,215,295],[692,55,360],[192,193,286],[359,673,209],[586,195,653],[121,89,573],[202,171,199],[238,515,311],[174,210,240],[174,105,166],[717,276,595],[1155,1149,452],[1405,56,197],[53,283,30],[75,53,30],[45,235,1651],[210,166,490],[181,193,192],[185,620,217],[26,798,759],[1070,226,204],[220,187,179],[220,168,187],[202,222,171],[359,209,181],[182,456,736],[964,167,1405],[76,250,414],[807,1280,1833],[70,883,1652],[227,179,204],[221,199,168],[221,202,199],[360,494,131],[214,241,319],[105,247,166],[205,203,260],[388,480,939],[482,855,211],[8,807,1833],[226,255,204],[228,221,168],[166,173,490],[701,369,702],[211,855,262],[631,920,630],[1448,1147,1584],[255,227,204],[237,220,179],[228,168,220],[222,256,555],[215,259,279],[126,271,38],[108,50,186],[227,236,179],[236,237,179],[220,237,228],[228,202,221],[256,222,202],[555,256,229],[259,152,279],[27,1296,31],[186,50,961],[961,234,372],[1651,235,812],[1572,1147,1448],[255,226,1778],[255,236,227],[256,257,229],[106,184,109],[241,410,188],[177,578,620],[209,673,181],[1136,1457,79],[1507,245,718],[255,273,236],[275,410,241],[206,851,250],[1459,253,1595],[1406,677,1650],[228,274,202],[202,281,256],[348,239,496],[205,172,203],[369,248,702],[261,550,218],[261,465,550],[574,243,566],[921,900,1220],[291,273,255],[348,238,265],[109,230,194],[149,380,323],[443,270,421],[272,291,255],[274,228,237],[274,292,202],[281,257,256],[276,543,341],[152,259,275],[1111,831,249],[632,556,364],[299,273,291],[299,236,273],[280,237,236],[202,292,281],[247,246,173],[282,49,66],[1620,1233,1553],[299,280,236],[280,305,237],[237,305,274],[306,292,274],[330,257,281],[246,194,264],[166,247,173],[912,894,896],[611,320,244],[1154,1020,907],[969,962,290],[272,299,291],[305,318,274],[145,212,240],[164,248,285],[259,277,275],[193,164,295],[269,240,210],[1033,288,320],[46,948,206],[336,280,299],[330,281,292],[257,307,300],[369,136,248],[145,240,269],[502,84,465],[193,295,286],[164,285,295],[282,302,49],[161,303,429],[318,306,274],[306,330,292],[315,257,330],[315,307,257],[307,352,300],[300,352,308],[275,277,403],[353,1141,333],[1420,425,47],[611,313,320],[85,126,83],[128,1180,43],[303,116,129],[280,314,305],[314,318,305],[190,181,242],[203,214,131],[820,795,815],[322,299,272],[322,336,299],[315,339,307],[172,152,617],[172,214,203],[321,1033,320],[1401,941,946],[85,160,138],[976,454,951],[747,60,786],[317,322,272],[339,352,307],[266,33,867],[163,224,218],[247,614,180],[648,639,553],[388,172,205],[611,345,313],[313,345,320],[160,127,303],[454,672,951],[317,329,322],[314,280,336],[306,338,330],[330,339,315],[1236,115,436],[342,321,320],[1046,355,328],[328,346,325],[325,346,317],[367,314,336],[314,337,318],[337,306,318],[338,343,330],[342,320,345],[355,349,328],[346,329,317],[347,336,322],[314,362,337],[330,343,339],[340,308,352],[135,906,1022],[239,156,491],[194,230,486],[40,1015,1003],[321,355,1046],[329,382,322],[382,347,322],[347,367,336],[337,371,306],[306,371,338],[1681,296,1493],[286,172,388],[230,348,486],[348,183,486],[384,332,830],[328,349,346],[367,362,314],[371,343,338],[339,351,352],[57,344,78],[342,355,321],[386,346,349],[386,350,346],[346,350,329],[347,366,367],[343,363,339],[323,380,324],[152,275,241],[345,1045,342],[350,374,329],[339,363,351],[234,340,352],[353,361,354],[40,34,1015],[373,355,342],[373,349,355],[374,382,329],[366,347,382],[371,363,343],[351,379,352],[379,372,352],[372,234,352],[156,190,491],[319,241,692],[354,361,31],[366,377,367],[363,379,351],[133,590,516],[197,56,271],[1045,370,342],[370,373,342],[374,350,386],[377,366,382],[367,395,362],[400,337,362],[400,371,337],[378,363,371],[106,109,614],[181,673,193],[953,920,631],[376,349,373],[376,386,349],[378,379,363],[224,375,218],[279,152,172],[361,619,381],[1347,823,795],[760,857,384],[392,374,386],[394,395,367],[383,371,400],[383,378,371],[218,375,261],[197,271,36],[414,454,976],[385,376,373],[1051,382,374],[387,394,367],[377,387,367],[395,400,362],[279,172,295],[30,365,225],[450,231,825],[385,373,370],[398,374,392],[1051,377,382],[396,378,383],[348,496,183],[295,172,286],[357,269,495],[1148,390,1411],[75,30,225],[206,76,54],[412,386,376],[412,392,386],[396,383,400],[651,114,878],[123,1241,506],[238,311,265],[381,653,29],[618,815,334],[427,1032,411],[298,414,976],[791,332,384],[129,100,140],[412,404,392],[392,404,398],[140,107,360],[395,394,400],[423,379,378],[385,412,376],[406,94,58],[419,415,1021],[422,423,378],[423,125,379],[258,508,238],[311,156,265],[213,287,491],[449,411,1024],[412,1068,404],[55,140,360],[76,414,54],[394,416,400],[400,416,396],[422,378,396],[1258,796,789],[427,411,449],[427,297,1032],[1385,1366,483],[417,448,284],[1507,341,245],[162,140,444],[658,44,81],[433,125,423],[438,251,125],[429,162,439],[1342,57,1348],[765,766,442],[697,891,695],[1057,396,416],[440,423,422],[440,433,423],[433,438,125],[438,196,251],[74,482,211],[1136,79,144],[29,195,424],[242,1004,492],[57,757,28],[414,298,54],[238,348,230],[224,163,124],[295,215,279],[495,269,490],[449,446,427],[446,297,427],[1020,1163,909],[128,138,419],[66,980,443],[415,439,1018],[111,396,1057],[111,422,396],[840,249,831],[593,664,596],[218,550,155],[109,194,180],[483,268,855],[161,415,419],[1737,232,428],[360,107,494],[1006,1011,410],[444,140,55],[919,843,430],[190,242,213],[275,403,410],[131,494,488],[449,663,446],[138,161,419],[128,419,34],[439,162,444],[460,440,422],[440,438,433],[472,74,445],[491,190,213],[238,508,515],[46,206,54],[972,944,962],[1241,1428,1284],[111,460,422],[470,432,806],[248,164,702],[1025,467,453],[553,1235,648],[263,114,881],[267,293,896],[469,438,440],[455,196,438],[287,242,492],[239,265,156],[213,242,287],[1684,746,63],[663,474,446],[415,161,429],[140,100,107],[1055,459,467],[469,455,438],[259,542,277],[446,474,466],[446,466,447],[439,444,1019],[614,109,180],[190,359,181],[156,497,190],[726,474,663],[1023,458,459],[461,440,460],[269,210,490],[246,180,194],[590,133,189],[163,218,155],[467,468,453],[1063,1029,111],[111,1029,460],[1029,464,460],[461,469,440],[150,149,323],[828,445,456],[375,502,261],[474,475,466],[573,426,462],[478,1023,477],[478,458,1023],[458,479,467],[459,458,467],[468,393,453],[464,461,460],[484,365,455],[1232,182,1380],[172,617,214],[547,694,277],[542,547,277],[184,258,238],[261,502,465],[467,479,468],[484,455,469],[1380,182,864],[475,476,466],[80,447,476],[466,476,447],[415,429,439],[479,487,468],[487,287,468],[492,393,468],[260,469,461],[481,365,484],[531,473,931],[692,360,319],[726,495,474],[468,287,492],[480,464,1029],[260,461,464],[494,481,484],[74,472,482],[174,240,212],[223,106,614],[486,477,485],[478,496,458],[491,487,479],[123,402,177],[488,469,260],[488,484,469],[265,239,348],[248,215,285],[474,490,475],[477,486,478],[458,496,479],[239,491,479],[1584,1147,1334],[488,494,484],[401,123,506],[495,490,474],[490,173,475],[80,476,264],[491,287,487],[480,1029,1004],[480,205,464],[173,476,475],[485,194,486],[486,183,478],[478,183,496],[496,239,479],[848,1166,60],[268,262,855],[205,260,464],[260,203,488],[203,131,488],[246,264,476],[194,485,264],[1002,310,1664],[311,515,497],[515,359,497],[565,359,515],[1250,1236,301],[736,456,151],[654,174,567],[577,534,648],[519,505,645],[725,565,508],[150,1723,148],[584,502,505],[584,526,502],[502,526,84],[607,191,682],[560,499,660],[607,517,191],[1038,711,124],[951,672,971],[716,507,356],[868,513,1198],[615,794,608],[682,191,174],[1313,928,1211],[617,241,214],[511,71,91],[408,800,792],[192,286,525],[80,485,447],[91,97,130],[1675,324,888],[207,756,532],[582,1097,1124],[311,497,156],[510,130,146],[523,511,510],[608,708,616],[546,690,650],[511,527,358],[536,146,518],[465,418,550],[418,709,735],[520,514,500],[584,505,519],[536,518,509],[146,536,510],[538,527,511],[876,263,669],[646,524,605],[510,536,523],[527,175,358],[724,876,669],[721,724,674],[524,683,834],[558,509,522],[558,536,509],[523,538,511],[611,243,574],[528,706,556],[668,541,498],[523,537,538],[527,540,175],[532,756,533],[1013,60,747],[551,698,699],[92,520,500],[535,536,558],[536,569,523],[538,540,527],[539,548,175],[567,212,145],[401,896,293],[534,675,639],[1510,595,1507],[557,545,530],[569,536,535],[537,540,538],[540,539,175],[569,537,523],[1135,718,47],[587,681,626],[580,535,558],[99,747,278],[701,565,725],[665,132,514],[665,514,575],[132,549,653],[176,651,189],[65,47,266],[597,569,535],[569,581,537],[537,581,540],[563,539,540],[539,564,548],[1509,1233,1434],[132,653,740],[550,710,155],[714,721,644],[410,1011,188],[732,534,586],[560,562,729],[555,557,222],[580,558,545],[597,535,580],[581,563,540],[5,821,1676],[576,215,136],[649,457,741],[564,539,563],[124,711,224],[550,668,710],[550,541,668],[565,701,673],[560,613,499],[233,532,625],[545,555,580],[601,581,569],[594,904,548],[1463,1425,434],[185,149,1454],[721,674,644],[185,380,149],[577,424,586],[462,586,559],[597,601,569],[594,548,564],[566,603,574],[165,543,544],[457,89,121],[586,424,195],[725,587,606],[1078,582,1124],[588,925,866],[462,559,593],[189,878,590],[555,229,580],[602,563,581],[904,594,956],[434,1425,1438],[1024,112,821],[572,587,626],[600,597,580],[599,591,656],[600,580,229],[601,622,581],[581,622,602],[602,564,563],[602,594,564],[603,611,574],[498,529,546],[697,1145,70],[592,628,626],[610,597,600],[597,610,601],[222,557,171],[604,765,799],[573,462,593],[133,200,176],[729,607,627],[1011,692,188],[518,146,130],[585,687,609],[682,627,607],[1712,599,656],[562,592,607],[643,656,654],[257,600,229],[601,633,622],[623,594,602],[174,212,567],[725,606,701],[609,701,606],[610,633,601],[633,642,622],[380,216,324],[142,143,1249],[501,732,586],[534,577,586],[648,1235,577],[610,641,633],[310,1002,1831],[618,334,604],[1710,145,269],[707,498,659],[501,586,462],[625,501,462],[726,663,691],[300,600,257],[641,610,600],[622,629,602],[602,629,623],[55,692,444],[518,748,509],[929,1515,1411],[620,578,267],[71,511,358],[707,668,498],[650,687,585],[600,300,641],[641,657,633],[1675,888,1669],[622,636,629],[505,502,375],[541,529,498],[332,420,1053],[637,551,638],[534,639,648],[69,623,873],[300,512,641],[633,657,642],[562,660,579],[687,637,638],[709,646,605],[775,738,885],[559,549,132],[646,683,524],[641,512,657],[266,897,949],[1712,643,1657],[184,727,258],[674,724,669],[699,714,647],[628,659,572],[657,662,642],[571,881,651],[517,607,504],[598,706,528],[598,694,547],[640,552,560],[655,693,698],[698,693,721],[91,510,511],[144,301,1136],[324,216,888],[870,764,1681],[575,514,520],[276,544,543],[658,175,44],[645,505,711],[659,546,572],[700,524,655],[605,700,529],[266,867,897],[1695,1526,764],[579,659,628],[654,591,682],[586,549,559],[698,721,714],[896,401,506],[640,734,599],[664,665,575],[621,629,636],[1712,656,643],[547,644,598],[710,668,707],[640,560,734],[655,698,551],[694,528,277],[512,662,657],[504,592,626],[688,584,519],[152,241,617],[587,725,681],[598,669,706],[526,670,84],[598,528,694],[710,707,499],[579,592,562],[660,659,579],[323,324,1134],[326,895,473],[195,29,653],[84,670,915],[560,660,562],[504,626,681],[711,505,224],[651,881,114],[216,620,889],[1362,678,197],[493,99,48],[1659,691,680],[529,690,546],[430,843,709],[655,524,693],[174,191,105],[674,669,598],[98,712,82],[572,546,585],[72,61,71],[912,911,894],[106,223,184],[664,132,665],[843,646,709],[635,699,136],[699,698,714],[593,132,664],[688,526,584],[185,177,620],[533,675,534],[687,638,635],[1652,89,457],[896,506,912],[132,740,514],[689,685,282],[691,449,680],[48,436,493],[136,699,647],[739,640,554],[549,586,653],[532,533,625],[1530,695,649],[653,381,619],[736,151,531],[188,692,241],[177,402,578],[33,689,867],[689,33,685],[593,559,132],[949,65,266],[711,1038,661],[939,480,1004],[609,369,701],[616,552,615],[619,361,740],[151,463,516],[513,521,117],[691,663,449],[186,251,196],[333,302,327],[613,560,552],[616,613,552],[690,551,637],[660,707,659],[704,208,1203],[418,735,550],[163,708,124],[524,834,693],[554,640,599],[245,341,165],[565,673,359],[155,710,708],[105,191,517],[1515,198,1411],[1709,554,599],[60,289,786],[838,1295,1399],[533,534,625],[710,499,708],[556,632,410],[217,620,216],[591,627,682],[504,503,223],[643,654,567],[690,637,650],[545,557,555],[174,654,682],[719,691,1659],[727,681,508],[645,711,661],[794,615,739],[565,515,508],[282,685,302],[1150,397,1149],[638,699,635],[544,685,33],[719,726,691],[1742,1126,1733],[1724,1475,148],[556,410,403],[185,217,380],[503,504,681],[277,556,403],[32,1178,158],[1712,1709,599],[605,529,541],[635,136,369],[687,635,369],[529,700,690],[700,551,690],[89,304,573],[625,534,732],[730,302,685],[503,681,727],[702,673,701],[730,327,302],[327,353,333],[596,664,575],[660,499,707],[585,546,650],[560,729,734],[700,655,551],[176,571,651],[517,504,223],[730,685,544],[1661,1682,726],[1682,495,726],[1250,301,917],[605,524,700],[609,687,369],[516,389,895],[1553,686,1027],[673,702,164],[656,591,654],[520,596,575],[402,123,401],[828,456,728],[1645,677,1653],[528,556,277],[638,551,699],[190,497,359],[276,730,544],[1117,1525,933],[1027,686,1306],[155,708,163],[709,605,541],[647,644,547],[650,637,687],[599,734,591],[578,293,267],[1682,357,495],[510,91,130],[734,729,627],[576,542,215],[709,541,735],[735,541,550],[276,500,730],[500,327,730],[653,619,740],[414,851,454],[734,627,591],[729,562,607],[615,552,640],[525,181,192],[308,512,300],[223,503,727],[266,165,33],[92,500,276],[321,1046,1033],[585,609,606],[1200,1559,86],[628,572,626],[301,436,803],[714,644,647],[708,499,613],[721,693,724],[514,353,327],[353,740,361],[344,158,78],[708,613,616],[615,640,739],[500,514,327],[514,740,353],[1449,177,185],[462,233,625],[851,405,1163],[608,616,615],[647,542,576],[625,732,501],[1097,582,1311],[1235,424,577],[579,628,592],[607,592,504],[24,432,470],[105,614,247],[104,742,471],[542,259,215],[365,196,455],[1420,47,65],[223,727,184],[547,542,647],[572,585,606],[587,572,606],[262,780,1370],[647,576,136],[644,674,598],[271,53,75],[727,508,258],[471,742,142],[505,375,224],[357,1710,269],[725,508,681],[659,498,546],[743,1178,32],[1195,634,231],[1176,24,470],[743,1110,1178],[135,809,857],[63,746,407],[634,1176,470],[159,1112,27],[1176,1685,24],[399,450,779],[1178,856,875],[751,744,54],[436,48,772],[634,1108,1210],[769,1285,1286],[751,298,755],[746,1684,754],[754,924,87],[722,1625,756],[87,839,153],[489,795,820],[758,808,1518],[839,840,153],[831,1111,959],[1111,749,959],[810,1253,1363],[1247,1394,713],[1388,1329,1201],[1242,120,761],[857,791,384],[758,1523,808],[296,764,1504],[70,1652,891],[207,233,1638],[1348,57,28],[858,420,332],[964,1379,1278],[420,1194,816],[784,1076,1186],[1076,21,1186],[1710,767,1],[849,822,778],[806,137,787],[786,790,744],[790,54,744],[771,63,407],[785,852,818],[774,1823,272],[895,151,516],[135,1022,809],[99,826,48],[48,826,755],[808,705,408],[833,441,716],[1733,743,32],[1385,836,852],[772,827,737],[1005,49,781],[793,1697,813],[1518,441,1537],[1139,1132,859],[782,801,770],[1510,1530,676],[770,814,835],[231,787,825],[207,722,756],[26,771,798],[782,863,865],[832,54,790],[865,842,507],[799,765,94],[1175,1261,1353],[800,408,805],[262,986,200],[792,800,814],[801,792,770],[704,1203,1148],[356,1514,822],[165,544,33],[561,776,113],[1043,738,775],[815,831,820],[773,792,801],[772,48,914],[772,737,803],[436,772,803],[808,817,705],[1624,822,1527],[588,1144,788],[799,762,604],[821,1520,1676],[854,803,666],[828,482,472],[445,74,463],[831,489,820],[828,836,482],[716,782,763],[334,815,766],[815,823,766],[334,766,765],[819,805,837],[1716,1521,1412],[1684,924,754],[800,805,819],[1709,829,554],[806,1349,137],[99,1013,747],[341,595,276],[817,810,818],[1176,1691,1685],[763,782,865],[830,846,1052],[865,1499,842],[982,846,1053],[847,832,790],[1178,875,158],[817,818,705],[1302,1392,45],[96,417,284],[223,614,517],[356,507,1514],[1166,848,1179],[1349,432,26],[717,92,276],[770,835,863],[522,509,1745],[847,841,832],[832,841,46],[829,739,554],[802,824,39],[397,1043,775],[1567,849,778],[1385,483,855],[1349,26,1346],[441,801,782],[402,401,293],[1043,667,738],[759,798,1007],[819,837,728],[728,837,828],[837,852,828],[1537,441,833],[148,1475,147],[805,705,837],[716,441,782],[483,1371,780],[814,819,844],[845,753,1336],[1661,719,4],[862,847,790],[737,827,666],[201,46,841],[810,785,818],[408,705,805],[1560,1536,849],[1585,853,1786],[7,1668,807],[7,807,8],[822,1514,1527],[800,819,814],[847,862,841],[991,857,760],[705,818,837],[808,408,773],[402,293,578],[791,858,332],[1480,1228,1240],[814,844,835],[785,1385,852],[1132,120,859],[1743,1726,684],[1704,783,1279],[1623,1694,1731],[959,489,831],[1518,808,773],[862,872,841],[441,773,801],[331,512,308],[380,217,216],[841,872,201],[818,852,837],[448,1480,1240],[856,1108,1195],[1527,1514,1526],[819,182,1232],[871,724,693],[852,836,828],[770,792,814],[803,737,666],[751,826,278],[1674,1727,1699],[849,356,822],[871,693,834],[507,842,1514],[1406,1097,869],[1328,1349,1346],[823,815,795],[744,751,278],[1110,856,1178],[520,717,316],[871,834,683],[884,876,724],[165,266,47],[716,763,507],[216,889,888],[853,1585,1570],[1536,716,356],[886,873,623],[782,770,863],[432,24,26],[683,882,871],[884,724,871],[114,876,884],[516,590,389],[11,1218,1628],[862,113,872],[886,623,629],[830,1052,1120],[762,153,604],[773,408,792],[763,865,507],[153,840,604],[882,884,871],[531,151,326],[886,890,873],[133,262,200],[819,1232,844],[621,636,122],[645,892,519],[1130,1076,784],[114,263,876],[1670,10,1663],[911,670,894],[452,885,872],[872,885,201],[887,882,683],[878,884,882],[590,878,882],[890,867,689],[897,629,621],[897,886,629],[819,728,182],[519,893,688],[894,670,526],[898,894,526],[1536,356,849],[810,1363,785],[878,114,884],[879,888,892],[892,889,893],[893,898,688],[895,683,843],[895,887,683],[889,620,267],[590,882,389],[418,465,84],[949,897,621],[897,890,886],[889,267,893],[898,267,896],[531,326,473],[189,651,878],[843,683,646],[897,867,890],[888,889,892],[893,267,898],[896,894,898],[473,895,843],[895,389,887],[974,706,669],[513,1115,521],[326,151,895],[809,791,857],[211,262,133],[920,923,947],[923,90,947],[90,25,947],[25,972,935],[64,431,899],[52,899,901],[903,905,59],[437,967,73],[839,1242,761],[904,975,44],[917,301,144],[915,670,911],[905,201,885],[1684,63,1685],[1033,1194,288],[950,913,755],[912,918,911],[950,914,913],[506,918,912],[922,919,915],[911,922,915],[1004,451,492],[1263,553,639],[922,911,918],[630,920,947],[916,506,926],[916,918,506],[521,1115,1098],[916,922,918],[919,418,915],[83,38,75],[24,1685,771],[110,1230,1213],[712,8,1837],[922,930,919],[919,430,418],[1395,1402,1187],[930,922,916],[594,623,69],[35,431,968],[35,968,969],[866,924,1684],[1625,1263,675],[631,630,52],[930,931,919],[430,709,418],[302,333,49],[1446,978,1138],[799,1007,798],[931,843,919],[947,25,64],[885,738,667],[1262,963,964],[899,970,901],[1401,946,938],[1117,933,1091],[1685,63,771],[905,948,201],[979,937,980],[951,953,950],[937,270,443],[1154,903,59],[1194,954,1067],[909,405,907],[850,1151,59],[1769,811,1432],[76,206,250],[938,946,966],[965,927,942],[938,966,957],[955,975,904],[927,965,934],[52,51,631],[59,905,667],[431,935,968],[786,289,561],[252,122,671],[481,494,107],[954,1817,1067],[795,25,90],[958,965,945],[795,972,25],[902,983,955],[972,489,944],[1256,29,424],[671,331,945],[946,958,963],[956,955,904],[902,955,956],[671,512,331],[945,331,961],[662,671,122],[671,662,512],[934,65,927],[630,947,52],[666,631,910],[850,59,667],[961,331,234],[1024,411,1042],[890,69,873],[252,671,945],[975,290,940],[283,186,196],[30,283,365],[950,755,298],[946,965,958],[985,290,975],[969,290,985],[405,851,206],[935,431,64],[941,1423,1420],[964,963,167],[942,252,945],[78,757,57],[49,1005,66],[937,979,270],[631,666,827],[980,937,443],[66,689,282],[421,902,956],[947,64,52],[35,979,899],[951,971,953],[762,87,153],[27,31,381],[924,839,87],[946,963,966],[331,308,340],[957,966,1262],[473,843,931],[953,971,920],[270,969,902],[935,962,968],[51,1005,781],[969,983,902],[437,73,940],[69,421,956],[761,249,840],[263,974,669],[962,944,967],[962,437,290],[985,975,955],[907,405,948],[720,957,1262],[25,935,64],[176,200,571],[108,945,50],[250,851,414],[200,986,571],[881,974,263],[827,772,953],[970,899,980],[29,159,27],[234,331,340],[948,405,206],[980,899,979],[986,984,571],[571,984,881],[990,706,974],[946,934,965],[970,980,66],[1113,1486,1554],[984,981,881],[881,987,974],[689,66,443],[1005,901,66],[983,985,955],[165,47,718],[987,990,974],[1370,986,262],[901,970,66],[51,901,1005],[981,987,881],[988,706,990],[942,945,965],[290,437,940],[64,899,52],[988,556,706],[941,934,946],[431,35,899],[996,989,984],[984,989,981],[981,989,987],[35,969,270],[1370,995,986],[986,995,984],[989,999,987],[987,992,990],[992,988,990],[962,967,437],[951,950,976],[979,35,270],[421,270,902],[998,995,1370],[987,999,992],[988,364,556],[969,985,983],[689,443,890],[995,1000,984],[219,958,108],[998,1000,995],[999,997,992],[914,953,772],[845,1336,745],[806,787,231],[1000,996,984],[989,996,999],[50,945,961],[443,421,69],[797,158,779],[1098,1463,434],[996,1009,999],[1001,988,992],[1001,364,988],[903,907,905],[26,759,973],[997,1001,992],[632,364,1001],[1346,26,973],[998,1008,1000],[1000,1009,996],[531,931,736],[252,949,621],[286,388,525],[1174,1008,998],[1009,1010,999],[999,1010,997],[1014,1001,997],[614,105,517],[958,945,108],[525,1004,242],[963,958,219],[233,426,304],[1000,1008,1009],[1010,1014,997],[1001,1006,632],[824,413,39],[642,636,622],[480,388,205],[28,757,797],[1014,1006,1001],[1006,410,632],[975,940,44],[1234,420,858],[54,832,46],[1009,1012,1010],[167,963,219],[41,481,107],[1017,1010,1012],[122,636,662],[939,525,388],[525,939,1004],[950,953,914],[829,1735,739],[1008,880,1015],[1008,1015,1009],[1263,639,675],[956,594,69],[795,90,1347],[1179,848,1013],[759,1007,973],[1009,1015,1012],[1012,1016,1017],[1017,1014,1010],[1019,1011,1006],[927,65,949],[649,316,595],[913,48,755],[976,950,298],[1003,1015,880],[1018,1006,1014],[1021,1018,1014],[444,692,1011],[451,1029,1063],[1185,851,1163],[29,27,381],[181,525,242],[1021,1014,1017],[1016,1021,1017],[1018,1019,1006],[1019,444,1011],[927,949,942],[451,393,492],[903,1154,907],[391,101,57],[94,765,58],[419,1016,1012],[949,252,942],[907,1020,909],[765,442,58],[94,406,908],[1007,94,908],[34,1012,1015],[34,419,1012],[419,1021,1016],[451,1057,393],[907,948,905],[1034,1073,1039],[1061,906,1619],[1068,960,1034],[471,1249,104],[112,1024,1042],[372,379,125],[341,543,165],[141,1094,170],[566,243,1061],[398,1034,1039],[325,317,1823],[1493,296,1724],[850,667,1043],[1054,297,1065],[1619,135,1074],[1061,243,906],[680,1024,821],[1103,96,1245],[1440,1123,1491],[1047,1025,1044],[672,454,1231],[1484,697,1530],[993,672,1231],[178,154,1088],[1044,1041,1066],[112,1062,1058],[1530,649,676],[178,1088,1040],[1046,328,954],[243,244,1022],[954,1194,1033],[1042,411,1032],[971,993,1056],[960,1093,1034],[1754,1338,232],[385,1064,412],[1057,1063,111],[748,1071,1447],[1530,697,695],[971,1056,1270],[977,1059,1211],[649,741,316],[1060,1452,1030],[353,354,1323],[695,768,649],[398,404,1034],[596,316,741],[1836,119,13],[1513,1115,1528],[883,1081,1652],[1039,1073,1048],[462,426,233],[31,1296,354],[1055,1047,1066],[1032,1054,1045],[1521,310,1224],[119,861,13],[1194,1234,288],[1109,1771,1070],[1166,1160,776],[1044,1035,1041],[1026,960,1064],[1050,1032,1045],[1049,1041,387],[115,1013,99],[1046,954,1033],[1321,920,971],[611,1058,345],[1048,1066,1049],[1023,1055,1073],[1029,451,1004],[118,1094,141],[1094,1080,170],[1042,1032,1050],[1026,1064,385],[15,16,1084],[1096,1079,61],[1075,1071,748],[325,1817,328],[909,1163,405],[1022,1234,809],[374,398,1051],[1082,72,81],[1023,1034,1093],[1817,1794,1067],[86,1445,1400],[1507,1535,1510],[1079,1096,1075],[568,1478,1104],[1070,178,1040],[1034,1023,1073],[776,1155,113],[1103,143,142],[1140,81,73],[1082,81,1140],[1060,1030,936],[1040,1086,1109],[370,1065,385],[61,72,1082],[1087,1096,1144],[1040,1088,1086],[1651,812,752],[1062,1050,1045],[187,154,178],[179,187,178],[1099,1344,1101],[1668,1058,807],[1073,1055,1048],[1099,1336,1344],[1283,943,1123],[1049,387,1051],[1024,680,449],[61,1082,1100],[967,749,1111],[1439,1037,88],[742,1505,142],[398,1039,1051],[1107,1336,1099],[1344,1542,1101],[142,1505,1103],[477,1093,447],[477,1023,1093],[471,142,1249],[1041,1035,394],[1328,568,1104],[61,1100,1096],[154,1092,1088],[112,1042,1050],[154,187,168],[435,235,45],[1075,1096,1087],[97,1075,748],[1049,1066,1041],[816,1067,1028],[846,982,1142],[1245,96,284],[1092,154,1080],[1057,451,1063],[387,377,1051],[1055,1025,1047],[1075,1087,1089],[1106,1108,856],[1068,1034,404],[1480,1545,868],[906,135,1619],[1074,991,1095],[570,566,1061],[1025,453,1044],[745,1336,1107],[1035,1057,416],[1092,1102,1129],[1074,135,991],[1105,745,1107],[447,1026,446],[394,387,1041],[73,81,940],[1118,1108,1106],[1210,1108,874],[243,1022,906],[412,1064,1068],[1280,611,603],[960,447,1093],[1051,1039,1049],[1040,1109,1070],[1471,1037,1439],[69,890,443],[1377,703,1374],[1092,1080,1102],[1096,1100,788],[1096,788,1144],[1114,967,1111],[446,1026,297],[70,1112,883],[453,393,1057],[1118,874,1108],[1054,370,1045],[1080,1094,1102],[1039,1048,1049],[428,753,845],[1047,1044,1066],[1044,453,1035],[1472,731,1512],[1126,1121,743],[743,1121,1110],[1032,297,1054],[1480,868,1216],[71,358,72],[1133,967,1114],[1105,1119,745],[1035,453,1057],[1026,447,960],[454,851,1190],[1030,1477,652],[589,816,1028],[1110,1121,1106],[1122,1118,1106],[1116,874,1118],[1048,1055,1066],[1194,1067,816],[744,278,747],[745,1120,845],[845,1052,428],[1105,1780,1119],[1065,297,385],[1098,1529,1463],[731,1060,936],[235,434,812],[1445,1525,1117],[1106,1121,1122],[1122,1127,1118],[1127,1116,1118],[1094,118,1732],[1119,1120,745],[1406,1124,1097],[435,117,235],[1462,1440,1037],[1126,1129,1121],[1088,1092,1129],[1133,73,967],[1120,1052,845],[812,434,752],[1441,1559,1200],[1131,588,413],[1054,1065,370],[235,1098,434],[1052,1142,428],[1737,428,1142],[1496,1446,1483],[1182,1083,1654],[1121,1129,1122],[1732,1116,1127],[768,457,649],[761,1114,249],[1064,960,1068],[1135,1481,1136],[1126,952,1129],[1087,588,1131],[1087,1144,588],[859,788,1139],[1140,1133,1132],[1133,1140,73],[1822,570,1061],[394,1035,416],[1055,1023,459],[80,264,485],[1119,1128,1120],[145,1658,567],[695,891,768],[1129,1102,1122],[1122,1102,1127],[1416,1077,1413],[297,1026,385],[1052,846,1142],[1445,1117,1400],[952,1086,1129],[1714,1089,1131],[1131,1089,1087],[1100,1139,788],[112,1050,1062],[1323,354,1296],[49,333,1141],[1142,982,1737],[79,1457,1091],[1088,1129,1086],[1102,1094,1127],[1127,1094,1732],[1100,1082,1139],[1082,1132,1139],[1082,1140,1132],[1150,1043,397],[60,1166,289],[1696,1146,1698],[1297,1202,1313],[409,1297,1313],[1234,1194,420],[1408,1391,1394],[424,1235,1243],[1203,309,1148],[485,477,447],[1152,1156,850],[1153,1149,1155],[1153,1157,1149],[1149,1152,1150],[1156,1154,1151],[776,1153,1155],[1157,1152,1149],[1217,1393,1208],[1156,1159,1154],[1153,1165,1157],[1165,1152,1157],[1159,1020,1154],[1161,1153,776],[1161,1165,1153],[1165,1158,1152],[1152,1158,1156],[1158,1159,1156],[1166,776,561],[1160,1161,776],[1161,1164,1165],[1161,1160,1164],[1158,1162,1159],[1159,1162,1020],[1270,1321,971],[1164,1170,1165],[1165,1162,1158],[1162,1163,1020],[588,788,925],[1166,1167,1160],[1165,1170,1162],[1160,1167,1164],[1162,1170,1163],[1179,1167,1166],[1167,1168,1164],[1164,1168,1170],[1168,1169,1170],[1234,1022,288],[802,39,866],[1179,1168,1167],[1169,1173,1170],[1170,1173,1163],[1173,1185,1163],[1360,1267,1364],[1169,1185,1173],[611,244,243],[900,1226,1376],[1260,1408,1350],[618,840,831],[1181,1183,1179],[1179,1184,1168],[1208,1274,1291],[1183,1184,1179],[1168,1184,1169],[1387,1395,1254],[1208,1204,1172],[1182,1197,1083],[1187,1083,1197],[1213,1183,1181],[1169,1207,1185],[135,857,991],[1013,1213,1181],[1189,1183,1213],[1183,1189,1184],[1169,1184,1207],[1207,1190,1185],[1180,1389,1288],[1191,1192,1640],[1640,1192,1090],[1090,1205,1654],[1654,1205,1182],[1188,1395,1187],[1126,743,1733],[788,859,925],[809,1234,1171],[1193,1197,1182],[1189,1199,1184],[1639,1191,1637],[1639,1212,1191],[1205,1193,1182],[1198,1187,1197],[1199,1207,1184],[332,1053,846],[1090,1192,1205],[117,1188,1187],[435,1188,117],[435,1206,1188],[1199,1189,1213],[420,816,1053],[1212,1215,1191],[117,1187,1198],[45,1206,435],[120,1132,1133],[874,1116,1210],[1191,1215,1192],[1193,1216,1197],[1216,1198,1197],[1199,1214,1207],[117,521,235],[1220,1311,1078],[1220,900,1311],[1653,1215,1212],[1192,1225,1205],[1205,1209,1193],[1209,1216,1193],[1389,1217,1172],[1207,1214,454],[171,557,1747],[1805,1078,1787],[1805,1219,1078],[1198,1216,868],[666,910,854],[1230,1231,1213],[1213,1231,1199],[1199,1231,1214],[1219,1220,1078],[1215,1221,1192],[1192,1221,1225],[1225,1228,1205],[1205,1228,1209],[1209,1228,1216],[1464,1325,1223],[1215,1227,1221],[1228,1480,1216],[1226,1653,1376],[1653,1249,1215],[1221,1240,1225],[1225,1240,1228],[839,761,840],[1238,1219,1805],[1238,1220,1219],[1232,1380,1375],[1226,1249,1653],[1221,1227,1240],[233,207,532],[110,1236,1230],[1248,1231,1230],[1231,454,1214],[1249,1227,1215],[1248,1056,1231],[489,959,944],[448,1240,284],[925,859,1242],[1805,1244,1238],[1252,1220,1238],[1252,921,1220],[1236,1251,1230],[1230,1251,1248],[1056,993,1231],[1031,1264,1263],[68,1186,157],[1227,1245,1240],[1103,1245,143],[1243,1235,612],[1252,95,921],[1249,1226,1237],[1390,1387,1254],[1120,384,830],[830,332,846],[1227,143,1245],[1315,1369,1358],[1356,1269,1386],[972,795,489],[1831,1224,310],[1250,1255,1251],[1251,1056,1248],[1256,1243,103],[658,358,175],[1620,1238,1244],[1620,1252,1238],[1506,95,1252],[104,1249,1237],[1249,143,1227],[1268,1419,1329],[634,806,231],[618,831,815],[924,1242,839],[1255,1270,1251],[1251,1270,1056],[866,925,1242],[103,29,1256],[424,1243,1256],[134,1651,752],[1250,917,1255],[1172,1204,1260],[1352,1036,1276],[1265,1201,1329],[804,1282,1259],[1259,1294,723],[335,1330,1305],[407,762,799],[875,856,1195],[32,158,344],[967,944,749],[372,125,42],[1175,1354,1261],[553,612,1235],[1259,1273,1294],[1294,1283,723],[757,78,158],[407,799,798],[901,51,52],[139,1386,1389],[1386,1269,1389],[1389,1269,1217],[1148,1590,1268],[1428,1449,1450],[804,1281,1282],[1273,1259,1282],[158,399,779],[771,407,798],[521,1098,235],[917,1312,1255],[1312,1270,1255],[1217,1269,1393],[1195,1108,634],[1110,1106,856],[1210,1691,1176],[27,1112,1145],[1296,27,1145],[1171,858,791],[704,1148,1290],[1430,1436,1437],[1282,1308,1273],[1300,943,1283],[1393,1355,1274],[720,1278,769],[1287,1059,1399],[1310,1388,1272],[1312,1321,1270],[851,1185,1190],[1296,1145,1304],[26,24,771],[51,910,631],[1329,1290,1268],[1290,1148,1268],[1298,1293,733],[1281,1293,1282],[1282,1293,1308],[1308,1299,1273],[1300,1283,1294],[1340,943,1300],[1340,1301,943],[407,754,762],[1287,1399,1295],[34,139,128],[1288,1172,1260],[120,1133,1114],[1306,1113,1511],[1464,1223,1292],[1299,1294,1273],[1299,1300,1294],[1286,1295,838],[1285,1247,1286],[1247,713,1286],[1201,1265,1390],[1378,1368,1357],[1482,1320,917],[917,1320,1312],[850,1156,1151],[588,39,413],[1324,1306,686],[789,1365,928],[1223,1326,1292],[1292,1326,1298],[869,1097,1311],[790,786,561],[1323,1304,932],[1323,1296,1304],[1317,1324,686],[1306,368,1113],[1325,1342,1223],[1326,1348,1298],[1293,1327,1308],[1308,1318,1299],[704,1290,1258],[1320,1321,1312],[761,120,1114],[1684,802,866],[1674,6,1727],[1316,1323,932],[1335,1337,1305],[1348,1327,1293],[1298,1348,1293],[1333,1300,1299],[1333,1343,1300],[1328,1301,1340],[1328,1314,1301],[838,1399,1319],[921,1237,900],[409,1391,1408],[1376,1653,677],[1281,804,1458],[1331,1324,1317],[1324,368,1306],[368,1338,1307],[1327,797,1308],[797,1345,1308],[1308,1345,1318],[1318,1333,1299],[1341,1147,1572],[923,1321,1320],[923,920,1321],[39,588,866],[1141,1323,1316],[1330,1335,1305],[1337,1335,1336],[1339,1332,1325],[1223,1342,1326],[1342,1348,1326],[1348,797,1327],[1345,1333,1318],[1343,1340,1300],[1419,1265,1329],[1347,1320,1584],[1535,1141,1316],[1078,1311,582],[1344,1335,1330],[753,1331,1337],[368,1324,1331],[753,368,1331],[1332,1485,1325],[1325,1485,1342],[787,1343,1333],[137,1328,1340],[973,1341,1479],[406,1147,1341],[1171,1234,858],[1141,1535,1322],[49,1141,1322],[1344,1336,1335],[973,908,1341],[766,1347,1584],[1347,923,1320],[781,49,1322],[368,232,1338],[787,1340,1343],[787,137,1340],[568,1346,973],[58,1147,406],[442,1334,1147],[58,442,1147],[442,766,1334],[90,923,1347],[428,368,753],[779,1333,1345],[825,787,1333],[137,1349,1328],[1328,1346,568],[908,406,1341],[924,866,1242],[1336,753,1337],[428,232,368],[1115,777,1098],[1348,28,797],[797,779,1345],[779,825,1333],[1007,908,973],[583,1351,880],[1365,1246,977],[1658,145,1710],[1310,796,1388],[718,245,165],[1302,1272,1254],[1174,1351,583],[1174,715,1351],[1358,1260,1204],[1374,1373,1276],[1377,1374,1276],[678,1362,1382],[1377,1276,254],[139,34,40],[1008,1174,583],[1396,1286,1319],[768,891,457],[1316,932,1535],[1289,1371,1360],[182,736,864],[1355,1364,1274],[860,1367,1354],[1362,1222,1382],[1376,869,1311],[1590,1411,198],[1232,1375,877],[1394,1295,1286],[880,1356,1386],[880,1351,1356],[1211,1059,1287],[197,678,1405],[880,1386,1003],[1368,1253,1357],[1357,1253,1036],[715,1289,1364],[1354,1367,703],[1383,877,1375],[1266,1288,1260],[1373,1374,703],[1372,1289,1174],[1303,1366,1378],[1351,715,1355],[1665,1666,624],[1309,1357,1036],[900,1237,1226],[1174,1289,715],[1337,1331,1317],[1360,1303,1359],[1267,1354,1175],[1241,1284,1414],[1377,254,929],[1385,855,836],[1396,1319,1436],[1361,1366,1303],[1381,1368,1378],[1313,1211,1391],[1368,1385,1363],[813,82,861],[1058,1280,807],[893,519,892],[1359,1303,860],[1382,1350,1247],[1371,1303,1360],[1267,1175,1271],[769,1286,1396],[712,1837,82],[1366,1385,1381],[1365,796,1310],[1003,1386,40],[780,1371,1370],[561,862,790],[1284,1380,864],[1449,1428,177],[611,1280,1058],[1284,1375,1380],[926,506,1241],[1305,1337,1317],[309,1203,208],[1388,1201,1390],[1309,1036,1352],[1377,929,1411],[1399,1059,1257],[1112,70,1145],[289,1166,561],[1288,1389,1172],[1362,37,1180],[713,1394,1286],[1355,1393,1269],[1401,1423,941],[1274,1271,1384],[860,1378,1367],[715,1364,1355],[677,1406,869],[1297,1358,1202],[1388,1258,1329],[1180,1288,1266],[1008,583,880],[1524,1425,1463],[1390,1403,1387],[1278,1379,1247],[1278,1247,1285],[964,1278,1262],[1358,1369,1202],[1715,1699,1726],[926,1241,1414],[1341,1572,1479],[926,930,916],[1397,51,781],[409,1358,1297],[1236,436,301],[1376,677,869],[1351,1355,1356],[758,1534,1523],[1378,1357,1367],[977,1211,1365],[1135,1136,854],[1394,1391,1295],[1266,1260,1222],[1365,1302,1246],[1232,877,844],[736,930,864],[1408,1358,409],[1508,817,1523],[1381,1385,1368],[718,854,910],[854,718,1135],[1382,1222,1350],[1391,1211,1287],[1391,1287,1295],[1257,1651,134],[1414,1284,864],[1291,1369,1315],[1202,928,1313],[86,1400,1413],[1413,1200,86],[1263,1625,1031],[1413,1400,1404],[1002,1664,1834],[930,926,1414],[1399,1257,134],[520,316,596],[1393,1274,1208],[1657,1655,1712],[1407,1404,1400],[1404,1410,1413],[1649,1229,1406],[1362,1266,1222],[1384,1271,1175],[900,1376,1311],[1274,1384,1291],[1291,1384,1431],[1433,1396,1436],[1267,1359,1354],[309,1353,703],[838,1319,1286],[1407,1410,1404],[441,1518,773],[1241,123,1428],[1622,1521,1224],[1217,1208,1172],[1130,793,1076],[425,1409,1481],[1481,1409,1533],[1303,1378,860],[1350,1408,1394],[1246,1651,977],[1289,1360,1364],[1727,1694,1623],[1417,1407,1533],[1417,1410,1407],[1406,1650,1649],[1319,134,1437],[1414,864,930],[1406,1229,1124],[1354,1359,860],[1433,769,1396],[1417,1533,1409],[1416,1413,1410],[1415,1416,1410],[95,1237,921],[1392,1254,1395],[1360,1359,1267],[1258,1290,1329],[1180,128,1389],[1420,1409,425],[1417,1418,1410],[1418,1415,1410],[1422,1077,1416],[1247,1350,1394],[37,43,1180],[1204,1315,1358],[1428,1383,1375],[1356,1355,1269],[1409,1418,1417],[1302,45,1246],[1421,1416,1415],[1421,1422,1416],[1422,1494,1077],[957,720,938],[1423,1409,1420],[1423,1418,1409],[752,434,1438],[1260,1358,1408],[1363,1385,785],[1423,1426,1418],[1426,1424,1418],[1229,1649,1124],[1222,1260,1350],[1508,1523,1137],[1278,1285,769],[1482,917,144],[1418,1424,1415],[1425,1422,1421],[1425,1524,1422],[1272,1388,1390],[1391,409,1313],[1378,1366,1381],[1371,483,1361],[720,1262,1278],[29,103,159],[1271,1364,1267],[1424,1427,1415],[1537,1522,1518],[134,752,1438],[1420,934,941],[1428,1375,1284],[1277,1224,1831],[1362,1180,1266],[1401,1426,1423],[1577,1369,1291],[268,483,262],[1383,1450,1456],[1384,1175,1431],[1430,1415,1427],[1430,1421,1415],[1430,1425,1421],[1379,1382,1247],[1252,1553,1429],[1206,1392,1395],[1433,1430,1427],[309,208,1353],[1272,1390,1254],[1361,483,1366],[1523,817,808],[1302,1254,1392],[1371,1361,1303],[1426,1435,1424],[1435,1433,1424],[1433,1427,1424],[720,769,1433],[796,1258,1388],[1590,1419,1268],[1289,1372,1371],[1305,1317,1509],[998,1372,1174],[40,1386,139],[1261,1354,703],[1364,1271,1274],[134,1438,1437],[1436,1319,1437],[1317,686,1509],[1484,932,1304],[1434,1432,1509],[1420,65,934],[931,930,736],[1367,1357,1309],[1372,1370,1371],[1204,1208,1315],[1426,938,1435],[1368,1363,1253],[1207,454,1190],[1302,1310,1272],[309,1377,390],[390,1377,1411],[1370,1372,998],[1411,1590,1148],[720,1433,1435],[1450,1383,1428],[1379,678,1382],[1405,678,1379],[1208,1291,1315],[1399,134,1319],[1367,1309,1373],[1373,1352,1276],[596,741,593],[553,1264,612],[1433,1436,1430],[1437,1438,1430],[964,1405,1379],[1373,1309,1352],[1265,1403,1390],[1233,1618,1434],[1365,1310,1302],[789,796,1365],[720,1435,938],[128,139,1389],[1466,933,1525],[1191,1640,1637],[1314,1442,943],[1141,353,1323],[1489,1138,1474],[1462,1477,1440],[1474,1138,1488],[1442,1314,1443],[1446,1030,1546],[1484,1145,697],[1549,1443,1445],[1470,1572,1468],[1397,1239,1507],[1649,1825,1824],[1259,1440,1477],[1451,1450,1449],[978,1446,652],[1454,1456,1451],[1451,1456,1450],[341,1507,595],[933,1547,79],[804,1452,1060],[1454,1455,1456],[1398,1460,1454],[1455,877,1456],[1277,1831,1825],[804,1060,1458],[1339,1459,1595],[1314,1104,1443],[933,1448,1547],[147,1460,1398],[1460,1461,1454],[1454,1461,1455],[1292,1125,1464],[417,1531,1480],[1459,1339,1325],[811,1756,335],[1512,936,1490],[777,1529,1098],[147,1475,1460],[1464,253,1459],[836,855,482],[1487,1486,1307],[1104,1501,1443],[1439,1200,1532],[1475,1469,1460],[1460,1469,1461],[1325,1464,1459],[1277,1825,1649],[1532,1200,1077],[844,877,1455],[1572,933,1466],[1479,568,973],[1509,335,1305],[1339,1595,1759],[1469,1476,1461],[1461,1476,1455],[1104,1470,1468],[1464,1472,253],[1117,1091,1407],[1756,1542,335],[1206,1395,1188],[335,1542,1330],[835,844,1455],[1471,1598,1462],[1491,1442,1441],[835,1455,1476],[1441,1442,1443],[1489,1474,1473],[1251,1236,1250],[1030,1452,1477],[1598,1439,1532],[978,1598,1492],[1426,1401,938],[1448,1584,1482],[1724,1497,1475],[1475,1497,1469],[1484,1535,932],[1307,1486,1113],[1487,696,1495],[1037,1491,1441],[1030,1446,936],[1453,1487,1495],[696,1467,1495],[1138,1489,1483],[1497,1143,1469],[1469,1143,1476],[652,1598,978],[850,1043,1150],[1482,1584,1320],[1731,98,1697],[1113,1554,1573],[1524,1532,1494],[1496,1467,696],[1452,1259,1477],[296,1504,1497],[1504,1143,1497],[1143,1499,1476],[718,910,1498],[868,1540,1528],[817,1253,810],[1490,696,1487],[1440,1491,1037],[1510,676,595],[1488,1492,1517],[781,1239,1397],[1467,1519,1503],[1500,1307,1759],[1149,397,452],[1504,1514,1143],[1514,842,1143],[1125,733,1458],[1503,1531,1555],[1276,1036,1137],[1440,723,1123],[1036,1508,1137],[817,1508,1253],[103,883,1112],[1458,731,1472],[1512,1490,1487],[1487,1453,1486],[1138,978,1488],[1036,1253,1508],[1398,149,147],[1474,1517,1513],[1125,1458,1472],[1486,1453,1554],[1518,1534,758],[345,1058,1062],[928,1202,1369],[1554,1541,1505],[1464,1125,1472],[1504,764,1514],[304,426,573],[1505,742,1506],[1479,1572,1478],[1519,1483,1489],[833,716,1069],[1522,1534,1518],[1115,1513,777],[811,335,1432],[1591,1533,1407],[777,1517,1529],[1513,1517,777],[1498,910,1397],[1069,1539,833],[833,1539,1537],[1522,1551,1534],[1534,1551,1523],[1538,1137,1523],[910,51,1397],[1367,1373,703],[1466,1525,1468],[157,1186,1832],[1429,1511,1506],[1573,1505,1506],[1259,1452,804],[1503,1495,1467],[262,483,780],[1572,1466,1468],[1536,1556,716],[716,1556,1069],[1544,1523,1551],[1544,1538,1523],[1511,1573,1506],[933,1572,1448],[1543,1537,1539],[1537,1543,1522],[1091,933,79],[1519,1540,1545],[1549,1445,86],[1069,1548,1539],[1548,1543,1539],[1543,1551,1522],[1500,1487,1307],[68,784,1186],[1552,1544,1551],[1550,1538,1544],[1538,1550,1137],[1519,1473,1540],[1547,1448,1482],[1560,1563,1536],[1536,1563,1556],[1556,1548,1069],[1543,1558,1551],[1137,1550,1276],[1453,1495,1555],[1561,1543,1548],[1543,1561,1558],[1558,1566,1551],[1552,1550,1544],[1569,1557,1550],[1557,1276,1550],[1276,1557,254],[1531,1503,1480],[1535,1530,1510],[1545,1503,1519],[1547,1482,79],[1566,1552,1551],[1552,1569,1550],[1503,1545,1480],[703,1377,309],[1625,675,756],[1037,1441,88],[929,254,1557],[849,1567,1560],[1556,1564,1548],[1492,1529,1517],[1252,1429,1506],[1553,1027,1429],[1453,1555,1541],[1554,1453,1541],[1233,686,1553],[1328,1104,1314],[1564,1576,1548],[1548,1576,1561],[1557,1562,929],[1520,112,1668],[1483,1446,1138],[778,1570,1567],[1563,1564,1556],[1561,1565,1558],[1565,1566,1558],[1569,1552,1566],[1562,1557,1569],[1530,1535,1484],[1387,1402,1395],[1621,1634,1387],[1567,1568,1560],[1560,1568,1563],[1571,1569,1566],[1344,1330,1542],[1577,1431,1353],[1638,233,304],[1524,1463,1529],[1353,1431,1175],[1077,1200,1413],[1478,1470,1104],[1568,1575,1563],[1563,1575,1564],[1575,1576,1564],[1561,1576,1565],[1565,1574,1566],[1562,1515,929],[1555,96,1541],[1531,417,96],[1555,1531,96],[1246,45,1651],[208,1577,1353],[1586,1568,1567],[1574,1571,1566],[1571,1583,1569],[1474,1513,1528],[1239,1322,1535],[1478,1572,1470],[1570,1586,1567],[1488,1517,1474],[8,1833,1837],[1123,1442,1491],[1589,1568,1586],[1576,1594,1565],[1565,1594,1574],[1562,198,1515],[1559,1441,1549],[1441,1443,1549],[1135,425,1481],[1239,1535,1507],[1595,1487,1500],[1570,1585,1586],[1589,1578,1568],[1568,1578,1575],[1579,1569,1583],[1177,1577,208],[115,1236,110],[1578,1593,1575],[1587,1576,1575],[1576,1581,1594],[1571,1582,1583],[1588,1579,1583],[1579,1580,1562],[1569,1579,1562],[1562,1580,198],[1027,1511,1429],[1589,1593,1578],[1587,1581,1576],[1582,1574,1594],[1574,1582,1571],[1575,1593,1587],[1583,1582,1588],[1580,1590,198],[1587,1593,1581],[1505,1541,96],[1369,1577,1177],[1573,1554,1505],[1479,1478,568],[1585,1589,1586],[1369,1177,704],[766,1584,1334],[977,1257,1059],[1091,1591,1407],[1591,1091,1457],[1585,1604,1589],[1581,1592,1594],[1602,1582,1594],[1582,1608,1588],[1608,1579,1588],[1579,1597,1580],[1419,1590,1580],[1597,1419,1580],[1431,1577,1291],[1589,1604,1593],[1601,1596,1593],[1593,1596,1581],[1306,1511,1027],[1511,1113,1573],[1786,1412,1585],[1412,1604,1585],[1581,1596,1592],[1592,1602,1594],[1608,1599,1579],[1599,1611,1579],[1579,1611,1597],[1512,1487,253],[1519,1489,1473],[1545,1540,868],[1083,1187,1402],[1117,1407,1400],[1292,733,1125],[284,1240,1245],[1604,1600,1593],[1600,1601,1593],[1582,1607,1608],[789,1369,704],[1467,1483,1519],[1601,1613,1596],[1596,1613,1592],[1602,1607,1582],[1620,1553,1252],[1601,1605,1613],[1592,1613,1602],[1602,1606,1607],[1608,1609,1599],[1599,1609,1611],[1603,1597,1611],[1265,1419,1597],[1603,1265,1597],[1392,1206,45],[928,1369,789],[1474,1528,1473],[1104,1468,1501],[1412,1521,1604],[1613,1631,1602],[1607,1610,1608],[1608,1610,1609],[1476,863,835],[1495,1503,1555],[1498,1397,718],[1520,1668,7],[1604,1615,1600],[1605,1601,1600],[1602,1631,1606],[1606,1610,1607],[1759,1595,1500],[1292,1298,733],[1615,1604,1521],[1609,1603,1611],[652,1462,1598],[1468,1525,1445],[1443,1501,1445],[1134,1723,150],[1521,1622,1615],[1615,1616,1600],[1616,1605,1600],[1605,1616,1612],[1605,1612,1613],[1612,1617,1613],[1613,1617,1631],[1606,1614,1610],[1265,1603,1403],[448,417,1480],[1595,253,1487],[1501,1468,1445],[1383,1456,877],[1490,1496,696],[1610,1627,1609],[1627,1621,1609],[1591,1481,1533],[1598,1471,1439],[1353,1261,703],[1606,1631,1614],[1609,1621,1403],[1532,1077,1494],[1528,1115,513],[1546,652,1446],[1211,928,1365],[1540,1473,1528],[1078,1502,1787],[1425,1430,1438],[1617,1630,1631],[959,749,944],[566,570,603],[1716,310,1521],[775,452,397],[1615,1636,1616],[1616,1636,1612],[1610,1632,1627],[789,704,1258],[1457,1481,1591],[1769,1756,811],[207,1629,722],[1629,1625,722],[1224,1277,1622],[1622,1636,1615],[1636,1646,1612],[1612,1630,1617],[1631,1626,1614],[1614,1632,1610],[1506,104,95],[1481,1457,1136],[1123,943,1442],[936,1446,1496],[1499,863,1476],[1629,1031,1625],[1233,1509,686],[1633,1634,1621],[1621,1387,1403],[1472,1512,253],[1177,208,704],[1277,1636,1622],[1626,1632,1614],[1627,1633,1621],[936,1496,1490],[185,1454,1451],[731,936,1512],[1638,1635,207],[553,1263,1264],[1653,1212,1639],[1633,1627,1632],[1633,1387,1634],[1458,1060,731],[368,1307,1113],[1264,1031,1629],[1152,850,1150],[1277,1644,1636],[1646,1637,1612],[1637,1630,1612],[1647,1631,1630],[1647,1626,1631],[1422,1524,1494],[1030,652,1546],[1635,1629,207],[1635,1264,1629],[1639,1646,1636],[1637,1640,1630],[1641,1632,1626],[1632,1642,1633],[1633,1643,1387],[842,1499,1143],[865,863,1499],[1516,978,1492],[67,1130,784],[1103,1505,96],[88,1441,1200],[1644,1639,1636],[1640,1647,1630],[1647,1641,1626],[1633,1648,1643],[1492,1532,1524],[1488,1516,1492],[1037,1471,1462],[612,1264,1635],[1502,1078,1124],[1641,1642,1632],[1648,1633,1642],[1528,513,868],[1492,1598,1532],[1095,991,760],[679,157,1664],[760,1128,1785],[1277,1650,1644],[320,1022,244],[1559,1549,86],[1676,1520,7],[1488,978,1516],[1095,760,1785],[1128,384,1120],[304,312,1638],[1081,1638,312],[1081,1635,1638],[103,612,1635],[652,1477,1462],[1650,1645,1644],[1645,1639,1644],[1639,1637,1646],[1640,1090,1647],[1654,1641,1647],[1654,1642,1641],[1654,1648,1642],[1643,1402,1387],[1432,335,1509],[384,1128,760],[1652,312,304],[103,1243,612],[1277,1649,1650],[1090,1654,1647],[1643,1648,1402],[1134,324,1675],[679,68,157],[1652,1081,312],[1136,301,803],[1653,1639,1645],[723,1440,1259],[803,854,1136],[104,1506,742],[1112,159,103],[1654,1083,1648],[977,1651,1257],[1397,1507,718],[1081,103,1635],[1650,677,1645],[1083,1402,1648],[1706,1655,1671],[1624,1704,1711],[767,2,1],[608,794,294],[1678,1683,1686],[767,1682,2],[1669,1692,1675],[296,1681,764],[1671,1656,1672],[17,1673,1679],[1706,1671,1673],[1662,1674,1699],[1655,1657,1656],[418,84,915],[1526,1514,764],[1658,1657,567],[870,1695,764],[813,1697,98],[1659,821,5],[60,1013,848],[1013,110,1213],[661,1038,1692],[1660,1703,17],[1693,1673,17],[1663,1715,1743],[1013,115,110],[344,1733,32],[1670,1663,1743],[1670,1743,1738],[1677,1670,1738],[1661,4,3],[1084,1683,1678],[1728,793,1130],[1683,1767,1196],[1677,1738,1196],[1279,1786,853],[294,1038,608],[1279,1689,1786],[870,18,1708],[870,1680,1695],[1705,10,1670],[1084,1767,1683],[1196,1738,1686],[1750,870,1681],[1750,18,870],[1773,1703,1660],[1135,47,425],[150,323,1134],[1707,1655,1706],[1741,344,1687],[1685,1691,1684],[1684,1691,802],[1672,1656,0],[1038,124,608],[1671,1672,1690],[1628,1218,1767],[1686,1275,1667],[1493,1750,1681],[1773,18,1750],[1773,1660,18],[1679,1671,16],[1735,1706,1673],[1667,1678,1686],[1688,1658,1],[1656,1688,0],[1293,1281,1458],[1698,1678,1667],[1696,1130,1722],[1698,1667,1696],[1715,1662,1699],[1692,1038,294],[1682,767,357],[1669,661,1692],[802,1702,824],[1028,1067,1784],[822,1624,778],[119,813,861],[1218,1670,1677],[1703,1693,17],[1658,1710,1],[750,1730,1729],[1701,750,1729],[1693,1735,1673],[1731,1694,98],[1691,1702,802],[783,1729,1719],[1680,870,1708],[1707,1709,1655],[533,756,675],[1691,1210,1702],[11,1705,1670],[1767,1218,1196],[1218,1677,1196],[1664,1716,1721],[1729,1725,1719],[1729,1072,1725],[1210,1116,1702],[1702,1720,824],[1682,1661,2],[1713,1719,1721],[1716,1786,1713],[1730,1722,1072],[294,1717,1811],[1692,294,1666],[1659,680,821],[824,1720,1714],[1726,1731,1718],[345,1062,1045],[1738,1743,1275],[1075,1089,1071],[783,1719,1689],[1275,684,1728],[1692,1666,1665],[1675,1692,1665],[294,1811,1666],[1716,1664,310],[1678,1698,1700],[6,9,1727],[676,649,595],[381,31,361],[1723,1804,1772],[1727,9,1694],[1720,1089,1714],[1786,1716,1412],[1683,1196,1686],[1718,1697,1085],[1116,1739,1702],[1739,1734,1720],[1702,1739,1720],[1089,1720,1734],[509,748,1745],[1743,1715,1726],[1717,294,794],[1116,1732,1739],[1718,1731,1697],[1696,1667,1130],[1134,1665,1723],[1694,712,98],[101,1687,102],[391,1736,101],[662,636,642],[1734,1447,1089],[1089,1447,1071],[436,99,493],[1689,1279,783],[1485,1465,1342],[1736,1687,101],[344,1741,1733],[1741,1742,1733],[1735,829,1706],[829,1707,1706],[1485,1332,1465],[952,1126,1742],[1747,1447,1734],[879,892,645],[1730,1146,1696],[829,1709,1707],[1709,1712,1655],[118,1739,1732],[1332,1744,1465],[1687,1749,1741],[1741,1758,1742],[679,1072,68],[1072,1722,68],[118,1747,1739],[1747,1734,1739],[1465,1744,1736],[1736,1740,1687],[1704,1701,783],[1665,624,1723],[1722,1130,67],[1025,1055,467],[1444,14,1701],[558,522,530],[1657,1658,1688],[1339,1746,1332],[1332,1748,1744],[1687,1740,1749],[1741,1749,1758],[1109,952,1742],[1747,118,141],[1671,1690,1628],[1671,1628,16],[1657,1688,1656],[1745,748,1447],[357,767,1710],[1746,1748,1332],[1146,1700,1698],[1759,1307,1338],[1239,781,1322],[1745,1447,1747],[522,1745,1747],[316,717,595],[148,1493,1724],[1758,1109,1742],[1725,1072,679],[726,719,1661],[1695,1680,1526],[1772,1750,1493],[148,1772,1493],[1542,1751,1101],[952,1109,1086],[1744,1752,1736],[1736,1752,1740],[1753,1755,1740],[391,1342,1736],[821,112,1520],[557,530,1747],[530,522,1747],[994,879,645],[1542,1756,1751],[1813,1693,1703],[1746,1754,1748],[1748,1764,1744],[1752,1757,1740],[1740,1757,1753],[1749,1740,1755],[1755,1763,1749],[1763,1758,1749],[1275,1743,684],[1813,1735,1693],[1107,1099,1101],[1723,624,1804],[1403,1603,1609],[1748,1754,1764],[1744,1757,1752],[1760,1109,1758],[1465,1736,1342],[436,115,99],[1686,1738,1275],[1751,1766,1101],[1759,1754,1746],[1755,1753,1763],[1570,1279,853],[1701,1146,750],[1655,1656,1671],[11,1670,1218],[1761,1751,1756],[1766,1107,1101],[1726,1623,1731],[1711,1704,1279],[67,784,68],[558,530,545],[1620,1618,1233],[1769,1761,1756],[102,1687,344],[1338,1754,1759],[1754,232,1764],[1744,1765,1757],[1757,1763,1753],[1762,1760,1758],[1760,1771,1109],[1339,1759,1746],[1675,1665,1134],[1730,1696,1722],[1774,1751,1761],[1766,1780,1107],[1780,1105,1107],[1764,1765,1744],[1763,1762,1758],[1772,1773,1750],[1811,1813,1703],[1434,1769,1432],[1780,1766,1751],[232,1781,1764],[1711,1279,1570],[1688,1,0],[1774,1780,1751],[1764,1781,1765],[1765,1768,1757],[1757,1768,1763],[1777,1782,1760],[1762,1777,1760],[1769,1774,1761],[1763,1777,1762],[1760,1782,1771],[232,1737,1781],[1768,1776,1763],[272,255,774],[1669,994,661],[1618,1769,1434],[1765,589,1768],[1770,1777,1763],[1701,1729,783],[1783,1774,1769],[1789,1780,1774],[589,1775,1768],[1776,1770,1763],[1782,1778,1771],[1771,1778,1070],[624,1703,1773],[624,1811,1703],[1620,1244,1618],[1779,1769,1618],[1779,1783,1769],[739,1735,1813],[1775,1776,1768],[1790,1777,1770],[1777,1778,1782],[1725,679,1721],[733,1293,1458],[1802,1618,1244],[1802,1779,1618],[1788,1783,1779],[1789,1774,1783],[1796,1780,1789],[1796,1119,1780],[1823,1817,325],[1699,1727,1623],[750,1146,1730],[1497,1724,296],[1128,1119,1796],[61,62,71],[1131,413,824],[1114,1111,249],[1784,1776,1775],[1123,723,1283],[1791,1788,1779],[1788,1789,1783],[1095,1797,1074],[1028,1784,1775],[1784,1770,1776],[1777,1790,1778],[1793,1797,1095],[1797,1800,1074],[1798,1790,1770],[1805,1802,1244],[1802,1791,1779],[1792,1789,1788],[1793,1785,1128],[1793,1095,1785],[1074,1800,1619],[741,457,593],[1798,1770,1784],[1798,1794,1790],[1786,1689,1713],[684,1726,1718],[1728,1085,793],[1795,1787,1502],[1806,1802,1805],[1819,1788,1791],[1067,1798,1784],[1790,1794,1778],[1795,1502,1124],[1801,1805,1787],[1807,1791,1802],[1807,1819,1791],[1819,1792,1788],[1799,1128,1796],[994,645,661],[684,1085,1728],[684,1718,1085],[1699,1623,1726],[1801,1787,1795],[1808,1789,1792],[1808,1796,1789],[1799,1793,1128],[1809,1797,1793],[1809,1803,1797],[1803,1800,1797],[1067,1794,1798],[774,255,1778],[1673,1671,1679],[879,1669,888],[19,1807,1802],[1810,1619,1800],[879,994,1669],[1794,774,1778],[1723,1772,148],[1804,1773,1772],[1814,1795,1124],[1649,1814,1124],[1814,1801,1795],[1812,1806,1805],[19,1802,1806],[19,1819,1807],[1810,1800,1803],[1804,624,1773],[1714,1131,824],[1801,1812,1805],[1812,19,1806],[1808,1792,1819],[1799,1809,1793],[1821,1810,1803],[1717,739,1813],[1061,1619,1822],[1794,1817,774],[79,1482,144],[1815,1801,1814],[23,1819,19],[589,1028,1775],[1817,1823,774],[1689,1719,1713],[1824,1814,1649],[1827,1818,1801],[1818,1812,1801],[1818,19,1812],[1818,20,19],[1816,1809,1799],[1821,1803,1809],[1822,1619,1810],[124,708,608],[1663,10,1715],[1815,1827,1801],[1820,1808,1819],[23,1820,1819],[603,1810,1821],[603,1822,1810],[1085,1697,793],[1628,1690,11],[1527,1704,1624],[1730,1072,1729],[1526,1444,1704],[1526,1680,1444],[1704,1444,1701],[1816,1821,1809],[1722,67,68],[317,272,1823],[1716,1713,1721],[16,1628,1767],[1527,1526,1704],[1824,1826,1814],[1814,1826,1815],[1818,21,20],[1835,1808,1820],[603,570,1822],[226,1070,1778],[1013,1181,1179],[1721,679,1664],[1717,1813,1811],[1828,1827,1815],[22,1820,23],[22,1835,1820],[1830,603,1821],[719,1659,5],[643,567,1657],[1717,794,739],[1825,1826,1824],[1828,1815,1826],[1829,21,1818],[1808,1835,13],[4,719,5],[10,1662,1715],[1828,1832,1827],[1832,1818,1827],[12,1833,1816],[1833,1821,1816],[1833,1830,1821],[14,1146,1701],[1186,1829,1818],[1280,603,1830],[14,1700,1146],[1667,1728,1130],[1825,1834,1826],[1834,1828,1826],[1832,1186,1818],[1836,13,1835],[1624,1711,1570],[778,1624,1570],[1719,1725,1721],[1002,1825,1831],[1002,1834,1825],[1834,1832,1828],[1186,21,1829],[1836,1835,22],[1837,1833,12],[1280,1830,1833],[1667,1275,1728],[16,1767,1084],[589,1765,1838],[1765,1781,1838],[1781,1737,1838],[1737,982,1838],[982,1053,1838],[1053,816,1838],[816,589,1838]]

},{}],35:[function(require,module,exports){
module.exports = adjoint;

/**
 * Calculates the adjugate of a mat4
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the source matrix
 * @returns {mat4} out
 */
function adjoint(out, a) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    out[0]  =  (a11 * (a22 * a33 - a23 * a32) - a21 * (a12 * a33 - a13 * a32) + a31 * (a12 * a23 - a13 * a22));
    out[1]  = -(a01 * (a22 * a33 - a23 * a32) - a21 * (a02 * a33 - a03 * a32) + a31 * (a02 * a23 - a03 * a22));
    out[2]  =  (a01 * (a12 * a33 - a13 * a32) - a11 * (a02 * a33 - a03 * a32) + a31 * (a02 * a13 - a03 * a12));
    out[3]  = -(a01 * (a12 * a23 - a13 * a22) - a11 * (a02 * a23 - a03 * a22) + a21 * (a02 * a13 - a03 * a12));
    out[4]  = -(a10 * (a22 * a33 - a23 * a32) - a20 * (a12 * a33 - a13 * a32) + a30 * (a12 * a23 - a13 * a22));
    out[5]  =  (a00 * (a22 * a33 - a23 * a32) - a20 * (a02 * a33 - a03 * a32) + a30 * (a02 * a23 - a03 * a22));
    out[6]  = -(a00 * (a12 * a33 - a13 * a32) - a10 * (a02 * a33 - a03 * a32) + a30 * (a02 * a13 - a03 * a12));
    out[7]  =  (a00 * (a12 * a23 - a13 * a22) - a10 * (a02 * a23 - a03 * a22) + a20 * (a02 * a13 - a03 * a12));
    out[8]  =  (a10 * (a21 * a33 - a23 * a31) - a20 * (a11 * a33 - a13 * a31) + a30 * (a11 * a23 - a13 * a21));
    out[9]  = -(a00 * (a21 * a33 - a23 * a31) - a20 * (a01 * a33 - a03 * a31) + a30 * (a01 * a23 - a03 * a21));
    out[10] =  (a00 * (a11 * a33 - a13 * a31) - a10 * (a01 * a33 - a03 * a31) + a30 * (a01 * a13 - a03 * a11));
    out[11] = -(a00 * (a11 * a23 - a13 * a21) - a10 * (a01 * a23 - a03 * a21) + a20 * (a01 * a13 - a03 * a11));
    out[12] = -(a10 * (a21 * a32 - a22 * a31) - a20 * (a11 * a32 - a12 * a31) + a30 * (a11 * a22 - a12 * a21));
    out[13] =  (a00 * (a21 * a32 - a22 * a31) - a20 * (a01 * a32 - a02 * a31) + a30 * (a01 * a22 - a02 * a21));
    out[14] = -(a00 * (a11 * a32 - a12 * a31) - a10 * (a01 * a32 - a02 * a31) + a30 * (a01 * a12 - a02 * a11));
    out[15] =  (a00 * (a11 * a22 - a12 * a21) - a10 * (a01 * a22 - a02 * a21) + a20 * (a01 * a12 - a02 * a11));
    return out;
};
},{}],36:[function(require,module,exports){
module.exports = clone;

/**
 * Creates a new mat4 initialized with values from an existing matrix
 *
 * @param {mat4} a matrix to clone
 * @returns {mat4} a new 4x4 matrix
 */
function clone(a) {
    var out = new Float32Array(16);
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    out[4] = a[4];
    out[5] = a[5];
    out[6] = a[6];
    out[7] = a[7];
    out[8] = a[8];
    out[9] = a[9];
    out[10] = a[10];
    out[11] = a[11];
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
    return out;
};
},{}],37:[function(require,module,exports){
module.exports = copy;

/**
 * Copy the values from one mat4 to another
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the source matrix
 * @returns {mat4} out
 */
function copy(out, a) {
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    out[4] = a[4];
    out[5] = a[5];
    out[6] = a[6];
    out[7] = a[7];
    out[8] = a[8];
    out[9] = a[9];
    out[10] = a[10];
    out[11] = a[11];
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
    return out;
};
},{}],38:[function(require,module,exports){
module.exports = create;

/**
 * Creates a new identity mat4
 *
 * @returns {mat4} a new 4x4 matrix
 */
function create() {
    var out = new Float32Array(16);
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = 1;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 1;
    out[11] = 0;
    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
    out[15] = 1;
    return out;
};
},{}],39:[function(require,module,exports){
module.exports = determinant;

/**
 * Calculates the determinant of a mat4
 *
 * @param {mat4} a the source matrix
 * @returns {Number} determinant of a
 */
function determinant(a) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15],

        b00 = a00 * a11 - a01 * a10,
        b01 = a00 * a12 - a02 * a10,
        b02 = a00 * a13 - a03 * a10,
        b03 = a01 * a12 - a02 * a11,
        b04 = a01 * a13 - a03 * a11,
        b05 = a02 * a13 - a03 * a12,
        b06 = a20 * a31 - a21 * a30,
        b07 = a20 * a32 - a22 * a30,
        b08 = a20 * a33 - a23 * a30,
        b09 = a21 * a32 - a22 * a31,
        b10 = a21 * a33 - a23 * a31,
        b11 = a22 * a33 - a23 * a32;

    // Calculate the determinant
    return b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
};
},{}],40:[function(require,module,exports){
module.exports = fromQuat;

/**
 * Creates a matrix from a quaternion rotation.
 *
 * @param {mat4} out mat4 receiving operation result
 * @param {quat4} q Rotation quaternion
 * @returns {mat4} out
 */
function fromQuat(out, q) {
    var x = q[0], y = q[1], z = q[2], w = q[3],
        x2 = x + x,
        y2 = y + y,
        z2 = z + z,

        xx = x * x2,
        yx = y * x2,
        yy = y * y2,
        zx = z * x2,
        zy = z * y2,
        zz = z * z2,
        wx = w * x2,
        wy = w * y2,
        wz = w * z2;

    out[0] = 1 - yy - zz;
    out[1] = yx + wz;
    out[2] = zx - wy;
    out[3] = 0;

    out[4] = yx - wz;
    out[5] = 1 - xx - zz;
    out[6] = zy + wx;
    out[7] = 0;

    out[8] = zx + wy;
    out[9] = zy - wx;
    out[10] = 1 - xx - yy;
    out[11] = 0;

    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
    out[15] = 1;

    return out;
};
},{}],41:[function(require,module,exports){
module.exports = fromRotationTranslation;

/**
 * Creates a matrix from a quaternion rotation and vector translation
 * This is equivalent to (but much faster than):
 *
 *     mat4.identity(dest);
 *     mat4.translate(dest, vec);
 *     var quatMat = mat4.create();
 *     quat4.toMat4(quat, quatMat);
 *     mat4.multiply(dest, quatMat);
 *
 * @param {mat4} out mat4 receiving operation result
 * @param {quat4} q Rotation quaternion
 * @param {vec3} v Translation vector
 * @returns {mat4} out
 */
function fromRotationTranslation(out, q, v) {
    // Quaternion math
    var x = q[0], y = q[1], z = q[2], w = q[3],
        x2 = x + x,
        y2 = y + y,
        z2 = z + z,

        xx = x * x2,
        xy = x * y2,
        xz = x * z2,
        yy = y * y2,
        yz = y * z2,
        zz = z * z2,
        wx = w * x2,
        wy = w * y2,
        wz = w * z2;

    out[0] = 1 - (yy + zz);
    out[1] = xy + wz;
    out[2] = xz - wy;
    out[3] = 0;
    out[4] = xy - wz;
    out[5] = 1 - (xx + zz);
    out[6] = yz + wx;
    out[7] = 0;
    out[8] = xz + wy;
    out[9] = yz - wx;
    out[10] = 1 - (xx + yy);
    out[11] = 0;
    out[12] = v[0];
    out[13] = v[1];
    out[14] = v[2];
    out[15] = 1;
    
    return out;
};
},{}],42:[function(require,module,exports){
module.exports = frustum;

/**
 * Generates a frustum matrix with the given bounds
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {Number} left Left bound of the frustum
 * @param {Number} right Right bound of the frustum
 * @param {Number} bottom Bottom bound of the frustum
 * @param {Number} top Top bound of the frustum
 * @param {Number} near Near bound of the frustum
 * @param {Number} far Far bound of the frustum
 * @returns {mat4} out
 */
function frustum(out, left, right, bottom, top, near, far) {
    var rl = 1 / (right - left),
        tb = 1 / (top - bottom),
        nf = 1 / (near - far);
    out[0] = (near * 2) * rl;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = (near * 2) * tb;
    out[6] = 0;
    out[7] = 0;
    out[8] = (right + left) * rl;
    out[9] = (top + bottom) * tb;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[12] = 0;
    out[13] = 0;
    out[14] = (far * near * 2) * nf;
    out[15] = 0;
    return out;
};
},{}],43:[function(require,module,exports){
module.exports = identity;

/**
 * Set a mat4 to the identity matrix
 *
 * @param {mat4} out the receiving matrix
 * @returns {mat4} out
 */
function identity(out) {
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = 1;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 1;
    out[11] = 0;
    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
    out[15] = 1;
    return out;
};
},{}],44:[function(require,module,exports){
module.exports = {
  create: require('./create')
  , clone: require('./clone')
  , copy: require('./copy')
  , identity: require('./identity')
  , transpose: require('./transpose')
  , invert: require('./invert')
  , adjoint: require('./adjoint')
  , determinant: require('./determinant')
  , multiply: require('./multiply')
  , translate: require('./translate')
  , scale: require('./scale')
  , rotate: require('./rotate')
  , rotateX: require('./rotateX')
  , rotateY: require('./rotateY')
  , rotateZ: require('./rotateZ')
  , fromRotationTranslation: require('./fromRotationTranslation')
  , fromQuat: require('./fromQuat')
  , frustum: require('./frustum')
  , perspective: require('./perspective')
  , perspectiveFromFieldOfView: require('./perspectiveFromFieldOfView')
  , ortho: require('./ortho')
  , lookAt: require('./lookAt')
  , str: require('./str')
}
},{"./adjoint":35,"./clone":36,"./copy":37,"./create":38,"./determinant":39,"./fromQuat":40,"./fromRotationTranslation":41,"./frustum":42,"./identity":43,"./invert":45,"./lookAt":46,"./multiply":47,"./ortho":48,"./perspective":49,"./perspectiveFromFieldOfView":50,"./rotate":51,"./rotateX":52,"./rotateY":53,"./rotateZ":54,"./scale":55,"./str":56,"./translate":57,"./transpose":58}],45:[function(require,module,exports){
module.exports = invert;

/**
 * Inverts a mat4
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the source matrix
 * @returns {mat4} out
 */
function invert(out, a) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15],

        b00 = a00 * a11 - a01 * a10,
        b01 = a00 * a12 - a02 * a10,
        b02 = a00 * a13 - a03 * a10,
        b03 = a01 * a12 - a02 * a11,
        b04 = a01 * a13 - a03 * a11,
        b05 = a02 * a13 - a03 * a12,
        b06 = a20 * a31 - a21 * a30,
        b07 = a20 * a32 - a22 * a30,
        b08 = a20 * a33 - a23 * a30,
        b09 = a21 * a32 - a22 * a31,
        b10 = a21 * a33 - a23 * a31,
        b11 = a22 * a33 - a23 * a32,

        // Calculate the determinant
        det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

    if (!det) { 
        return null; 
    }
    det = 1.0 / det;

    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;

    return out;
};
},{}],46:[function(require,module,exports){
var identity = require('./identity');

module.exports = lookAt;

/**
 * Generates a look-at matrix with the given eye position, focal point, and up axis
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {vec3} eye Position of the viewer
 * @param {vec3} center Point the viewer is looking at
 * @param {vec3} up vec3 pointing up
 * @returns {mat4} out
 */
function lookAt(out, eye, center, up) {
    var x0, x1, x2, y0, y1, y2, z0, z1, z2, len,
        eyex = eye[0],
        eyey = eye[1],
        eyez = eye[2],
        upx = up[0],
        upy = up[1],
        upz = up[2],
        centerx = center[0],
        centery = center[1],
        centerz = center[2];

    if (Math.abs(eyex - centerx) < 0.000001 &&
        Math.abs(eyey - centery) < 0.000001 &&
        Math.abs(eyez - centerz) < 0.000001) {
        return identity(out);
    }

    z0 = eyex - centerx;
    z1 = eyey - centery;
    z2 = eyez - centerz;

    len = 1 / Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2);
    z0 *= len;
    z1 *= len;
    z2 *= len;

    x0 = upy * z2 - upz * z1;
    x1 = upz * z0 - upx * z2;
    x2 = upx * z1 - upy * z0;
    len = Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2);
    if (!len) {
        x0 = 0;
        x1 = 0;
        x2 = 0;
    } else {
        len = 1 / len;
        x0 *= len;
        x1 *= len;
        x2 *= len;
    }

    y0 = z1 * x2 - z2 * x1;
    y1 = z2 * x0 - z0 * x2;
    y2 = z0 * x1 - z1 * x0;

    len = Math.sqrt(y0 * y0 + y1 * y1 + y2 * y2);
    if (!len) {
        y0 = 0;
        y1 = 0;
        y2 = 0;
    } else {
        len = 1 / len;
        y0 *= len;
        y1 *= len;
        y2 *= len;
    }

    out[0] = x0;
    out[1] = y0;
    out[2] = z0;
    out[3] = 0;
    out[4] = x1;
    out[5] = y1;
    out[6] = z1;
    out[7] = 0;
    out[8] = x2;
    out[9] = y2;
    out[10] = z2;
    out[11] = 0;
    out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
    out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
    out[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
    out[15] = 1;

    return out;
};
},{"./identity":43}],47:[function(require,module,exports){
module.exports = multiply;

/**
 * Multiplies two mat4's
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the first operand
 * @param {mat4} b the second operand
 * @returns {mat4} out
 */
function multiply(out, a, b) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    // Cache only the current line of the second matrix
    var b0  = b[0], b1 = b[1], b2 = b[2], b3 = b[3];  
    out[0] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[1] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[2] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[3] = b0*a03 + b1*a13 + b2*a23 + b3*a33;

    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    out[4] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[5] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[6] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[7] = b0*a03 + b1*a13 + b2*a23 + b3*a33;

    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    out[8] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[9] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[10] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[11] = b0*a03 + b1*a13 + b2*a23 + b3*a33;

    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    out[12] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[13] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[14] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[15] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
    return out;
};
},{}],48:[function(require,module,exports){
module.exports = ortho;

/**
 * Generates a orthogonal projection matrix with the given bounds
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {number} left Left bound of the frustum
 * @param {number} right Right bound of the frustum
 * @param {number} bottom Bottom bound of the frustum
 * @param {number} top Top bound of the frustum
 * @param {number} near Near bound of the frustum
 * @param {number} far Far bound of the frustum
 * @returns {mat4} out
 */
function ortho(out, left, right, bottom, top, near, far) {
    var lr = 1 / (left - right),
        bt = 1 / (bottom - top),
        nf = 1 / (near - far);
    out[0] = -2 * lr;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = -2 * bt;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 2 * nf;
    out[11] = 0;
    out[12] = (left + right) * lr;
    out[13] = (top + bottom) * bt;
    out[14] = (far + near) * nf;
    out[15] = 1;
    return out;
};
},{}],49:[function(require,module,exports){
module.exports = perspective;

/**
 * Generates a perspective projection matrix with the given bounds
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {number} fovy Vertical field of view in radians
 * @param {number} aspect Aspect ratio. typically viewport width/height
 * @param {number} near Near bound of the frustum
 * @param {number} far Far bound of the frustum
 * @returns {mat4} out
 */
function perspective(out, fovy, aspect, near, far) {
    var f = 1.0 / Math.tan(fovy / 2),
        nf = 1 / (near - far);
    out[0] = f / aspect;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = f;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[12] = 0;
    out[13] = 0;
    out[14] = (2 * far * near) * nf;
    out[15] = 0;
    return out;
};
},{}],50:[function(require,module,exports){
module.exports = perspectiveFromFieldOfView;

/**
 * Generates a perspective projection matrix with the given field of view.
 * This is primarily useful for generating projection matrices to be used
 * with the still experiemental WebVR API.
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {number} fov Object containing the following values: upDegrees, downDegrees, leftDegrees, rightDegrees
 * @param {number} near Near bound of the frustum
 * @param {number} far Far bound of the frustum
 * @returns {mat4} out
 */
function perspectiveFromFieldOfView(out, fov, near, far) {
    var upTan = Math.tan(fov.upDegrees * Math.PI/180.0),
        downTan = Math.tan(fov.downDegrees * Math.PI/180.0),
        leftTan = Math.tan(fov.leftDegrees * Math.PI/180.0),
        rightTan = Math.tan(fov.rightDegrees * Math.PI/180.0),
        xScale = 2.0 / (leftTan + rightTan),
        yScale = 2.0 / (upTan + downTan);

    out[0] = xScale;
    out[1] = 0.0;
    out[2] = 0.0;
    out[3] = 0.0;
    out[4] = 0.0;
    out[5] = yScale;
    out[6] = 0.0;
    out[7] = 0.0;
    out[8] = -((leftTan - rightTan) * xScale * 0.5);
    out[9] = ((upTan - downTan) * yScale * 0.5);
    out[10] = far / (near - far);
    out[11] = -1.0;
    out[12] = 0.0;
    out[13] = 0.0;
    out[14] = (far * near) / (near - far);
    out[15] = 0.0;
    return out;
}


},{}],51:[function(require,module,exports){
module.exports = rotate;

/**
 * Rotates a mat4 by the given angle
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @param {vec3} axis the axis to rotate around
 * @returns {mat4} out
 */
function rotate(out, a, rad, axis) {
    var x = axis[0], y = axis[1], z = axis[2],
        len = Math.sqrt(x * x + y * y + z * z),
        s, c, t,
        a00, a01, a02, a03,
        a10, a11, a12, a13,
        a20, a21, a22, a23,
        b00, b01, b02,
        b10, b11, b12,
        b20, b21, b22;

    if (Math.abs(len) < 0.000001) { return null; }
    
    len = 1 / len;
    x *= len;
    y *= len;
    z *= len;

    s = Math.sin(rad);
    c = Math.cos(rad);
    t = 1 - c;

    a00 = a[0]; a01 = a[1]; a02 = a[2]; a03 = a[3];
    a10 = a[4]; a11 = a[5]; a12 = a[6]; a13 = a[7];
    a20 = a[8]; a21 = a[9]; a22 = a[10]; a23 = a[11];

    // Construct the elements of the rotation matrix
    b00 = x * x * t + c; b01 = y * x * t + z * s; b02 = z * x * t - y * s;
    b10 = x * y * t - z * s; b11 = y * y * t + c; b12 = z * y * t + x * s;
    b20 = x * z * t + y * s; b21 = y * z * t - x * s; b22 = z * z * t + c;

    // Perform rotation-specific matrix multiplication
    out[0] = a00 * b00 + a10 * b01 + a20 * b02;
    out[1] = a01 * b00 + a11 * b01 + a21 * b02;
    out[2] = a02 * b00 + a12 * b01 + a22 * b02;
    out[3] = a03 * b00 + a13 * b01 + a23 * b02;
    out[4] = a00 * b10 + a10 * b11 + a20 * b12;
    out[5] = a01 * b10 + a11 * b11 + a21 * b12;
    out[6] = a02 * b10 + a12 * b11 + a22 * b12;
    out[7] = a03 * b10 + a13 * b11 + a23 * b12;
    out[8] = a00 * b20 + a10 * b21 + a20 * b22;
    out[9] = a01 * b20 + a11 * b21 + a21 * b22;
    out[10] = a02 * b20 + a12 * b21 + a22 * b22;
    out[11] = a03 * b20 + a13 * b21 + a23 * b22;

    if (a !== out) { // If the source and destination differ, copy the unchanged last row
        out[12] = a[12];
        out[13] = a[13];
        out[14] = a[14];
        out[15] = a[15];
    }
    return out;
};
},{}],52:[function(require,module,exports){
module.exports = rotateX;

/**
 * Rotates a matrix by the given angle around the X axis
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat4} out
 */
function rotateX(out, a, rad) {
    var s = Math.sin(rad),
        c = Math.cos(rad),
        a10 = a[4],
        a11 = a[5],
        a12 = a[6],
        a13 = a[7],
        a20 = a[8],
        a21 = a[9],
        a22 = a[10],
        a23 = a[11];

    if (a !== out) { // If the source and destination differ, copy the unchanged rows
        out[0]  = a[0];
        out[1]  = a[1];
        out[2]  = a[2];
        out[3]  = a[3];
        out[12] = a[12];
        out[13] = a[13];
        out[14] = a[14];
        out[15] = a[15];
    }

    // Perform axis-specific matrix multiplication
    out[4] = a10 * c + a20 * s;
    out[5] = a11 * c + a21 * s;
    out[6] = a12 * c + a22 * s;
    out[7] = a13 * c + a23 * s;
    out[8] = a20 * c - a10 * s;
    out[9] = a21 * c - a11 * s;
    out[10] = a22 * c - a12 * s;
    out[11] = a23 * c - a13 * s;
    return out;
};
},{}],53:[function(require,module,exports){
module.exports = rotateY;

/**
 * Rotates a matrix by the given angle around the Y axis
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat4} out
 */
function rotateY(out, a, rad) {
    var s = Math.sin(rad),
        c = Math.cos(rad),
        a00 = a[0],
        a01 = a[1],
        a02 = a[2],
        a03 = a[3],
        a20 = a[8],
        a21 = a[9],
        a22 = a[10],
        a23 = a[11];

    if (a !== out) { // If the source and destination differ, copy the unchanged rows
        out[4]  = a[4];
        out[5]  = a[5];
        out[6]  = a[6];
        out[7]  = a[7];
        out[12] = a[12];
        out[13] = a[13];
        out[14] = a[14];
        out[15] = a[15];
    }

    // Perform axis-specific matrix multiplication
    out[0] = a00 * c - a20 * s;
    out[1] = a01 * c - a21 * s;
    out[2] = a02 * c - a22 * s;
    out[3] = a03 * c - a23 * s;
    out[8] = a00 * s + a20 * c;
    out[9] = a01 * s + a21 * c;
    out[10] = a02 * s + a22 * c;
    out[11] = a03 * s + a23 * c;
    return out;
};
},{}],54:[function(require,module,exports){
module.exports = rotateZ;

/**
 * Rotates a matrix by the given angle around the Z axis
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat4} out
 */
function rotateZ(out, a, rad) {
    var s = Math.sin(rad),
        c = Math.cos(rad),
        a00 = a[0],
        a01 = a[1],
        a02 = a[2],
        a03 = a[3],
        a10 = a[4],
        a11 = a[5],
        a12 = a[6],
        a13 = a[7];

    if (a !== out) { // If the source and destination differ, copy the unchanged last row
        out[8]  = a[8];
        out[9]  = a[9];
        out[10] = a[10];
        out[11] = a[11];
        out[12] = a[12];
        out[13] = a[13];
        out[14] = a[14];
        out[15] = a[15];
    }

    // Perform axis-specific matrix multiplication
    out[0] = a00 * c + a10 * s;
    out[1] = a01 * c + a11 * s;
    out[2] = a02 * c + a12 * s;
    out[3] = a03 * c + a13 * s;
    out[4] = a10 * c - a00 * s;
    out[5] = a11 * c - a01 * s;
    out[6] = a12 * c - a02 * s;
    out[7] = a13 * c - a03 * s;
    return out;
};
},{}],55:[function(require,module,exports){
module.exports = scale;

/**
 * Scales the mat4 by the dimensions in the given vec3
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to scale
 * @param {vec3} v the vec3 to scale the matrix by
 * @returns {mat4} out
 **/
function scale(out, a, v) {
    var x = v[0], y = v[1], z = v[2];

    out[0] = a[0] * x;
    out[1] = a[1] * x;
    out[2] = a[2] * x;
    out[3] = a[3] * x;
    out[4] = a[4] * y;
    out[5] = a[5] * y;
    out[6] = a[6] * y;
    out[7] = a[7] * y;
    out[8] = a[8] * z;
    out[9] = a[9] * z;
    out[10] = a[10] * z;
    out[11] = a[11] * z;
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
    return out;
};
},{}],56:[function(require,module,exports){
module.exports = str;

/**
 * Returns a string representation of a mat4
 *
 * @param {mat4} mat matrix to represent as a string
 * @returns {String} string representation of the matrix
 */
function str(a) {
    return 'mat4(' + a[0] + ', ' + a[1] + ', ' + a[2] + ', ' + a[3] + ', ' +
                    a[4] + ', ' + a[5] + ', ' + a[6] + ', ' + a[7] + ', ' +
                    a[8] + ', ' + a[9] + ', ' + a[10] + ', ' + a[11] + ', ' + 
                    a[12] + ', ' + a[13] + ', ' + a[14] + ', ' + a[15] + ')';
};
},{}],57:[function(require,module,exports){
module.exports = translate;

/**
 * Translate a mat4 by the given vector
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to translate
 * @param {vec3} v vector to translate by
 * @returns {mat4} out
 */
function translate(out, a, v) {
    var x = v[0], y = v[1], z = v[2],
        a00, a01, a02, a03,
        a10, a11, a12, a13,
        a20, a21, a22, a23;

    if (a === out) {
        out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
        out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
        out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
        out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
    } else {
        a00 = a[0]; a01 = a[1]; a02 = a[2]; a03 = a[3];
        a10 = a[4]; a11 = a[5]; a12 = a[6]; a13 = a[7];
        a20 = a[8]; a21 = a[9]; a22 = a[10]; a23 = a[11];

        out[0] = a00; out[1] = a01; out[2] = a02; out[3] = a03;
        out[4] = a10; out[5] = a11; out[6] = a12; out[7] = a13;
        out[8] = a20; out[9] = a21; out[10] = a22; out[11] = a23;

        out[12] = a00 * x + a10 * y + a20 * z + a[12];
        out[13] = a01 * x + a11 * y + a21 * z + a[13];
        out[14] = a02 * x + a12 * y + a22 * z + a[14];
        out[15] = a03 * x + a13 * y + a23 * z + a[15];
    }

    return out;
};
},{}],58:[function(require,module,exports){
module.exports = transpose;

/**
 * Transpose the values of a mat4
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the source matrix
 * @returns {mat4} out
 */
function transpose(out, a) {
    // If we are transposing ourselves we can skip a few steps but have to cache some values
    if (out === a) {
        var a01 = a[1], a02 = a[2], a03 = a[3],
            a12 = a[6], a13 = a[7],
            a23 = a[11];

        out[1] = a[4];
        out[2] = a[8];
        out[3] = a[12];
        out[4] = a01;
        out[6] = a[9];
        out[7] = a[13];
        out[8] = a02;
        out[9] = a12;
        out[11] = a[14];
        out[12] = a03;
        out[13] = a13;
        out[14] = a23;
    } else {
        out[0] = a[0];
        out[1] = a[4];
        out[2] = a[8];
        out[3] = a[12];
        out[4] = a[1];
        out[5] = a[5];
        out[6] = a[9];
        out[7] = a[13];
        out[8] = a[2];
        out[9] = a[6];
        out[10] = a[10];
        out[11] = a[14];
        out[12] = a[3];
        out[13] = a[7];
        out[14] = a[11];
        out[15] = a[15];
    }
    
    return out;
};
},{}],59:[function(require,module,exports){

var extend = require('./lib/extend')
var getContext = require('./lib/context')
var createStringStore = require('./lib/strings')
var wrapExtensions = require('./lib/extension')
var wrapLimits = require('./lib/limits')
var wrapBuffers = require('./lib/buffer')
var wrapElements = require('./lib/elements')
var wrapTextures = require('./lib/texture')
var wrapRenderbuffers = require('./lib/renderbuffer')
var wrapFramebuffers = require('./lib/framebuffer')
var wrapUniforms = require('./lib/uniform')
var wrapAttributes = require('./lib/attribute')
var wrapShaders = require('./lib/shader')
var wrapDraw = require('./lib/draw')
var wrapContext = require('./lib/state')
var createCompiler = require('./lib/compile')
var wrapRead = require('./lib/read')
var dynamic = require('./lib/dynamic')
var raf = require('./lib/raf')
var clock = require('./lib/clock')

var GL_COLOR_BUFFER_BIT = 16384
var GL_DEPTH_BUFFER_BIT = 256
var GL_STENCIL_BUFFER_BIT = 1024

var GL_ARRAY_BUFFER = 34962
var GL_TEXTURE_2D = 0x0DE1
var GL_TEXTURE_CUBE_MAP = 0x8513

var CONTEXT_LOST_EVENT = 'webglcontextlost'
var CONTEXT_RESTORED_EVENT = 'webglcontextrestored'

module.exports = function wrapREGL () {
  var args = getContext(Array.prototype.slice.call(arguments))
  var gl = args.gl
  var options = args.options

  // Use string store to track string ids
  var stringStore = createStringStore()

  var extensionState = wrapExtensions(gl)
  var extensions = extensionState.extensions

  var viewportState = {
    width: gl.drawingBufferWidth,
    height: gl.drawingBufferHeight
  }

  var limits = wrapLimits(
    gl,
    extensions)

  var bufferState = wrapBuffers(gl)

  var elementState = wrapElements(
    gl,
    extensions,
    bufferState)

  var uniformState = wrapUniforms(stringStore)

  var attributeState = wrapAttributes(
    gl,
    extensions,
    limits,
    bufferState,
    stringStore)

  var shaderState = wrapShaders(
    gl,
    attributeState,
    uniformState,
    function (program) {
      return compiler.draw(program)
    },
    stringStore)

  var drawState = wrapDraw(
    gl,
    extensions,
    bufferState)

  var textureState = wrapTextures(
    gl,
    extensions,
    limits,
    poll,
    viewportState)

  var renderbufferState = wrapRenderbuffers(
    gl,
    extensions,
    limits)

  var framebufferState = wrapFramebuffers(
    gl,
    extensions,
    limits,
    textureState,
    renderbufferState)

  var frameState = {
    count: 0,
    start: clock(),
    dt: 0,
    t: clock(),
    renderTime: 0,
    width: gl.drawingBufferWidth,
    height: gl.drawingBufferHeight,
    pixelRatio: options.pixelRatio
  }

  var glState = wrapContext(
    gl,
    framebufferState,
    viewportState)

  var readPixels = wrapRead(gl, poll, viewportState)

  var compiler = createCompiler(
    gl,
    stringStore,
    extensions,
    limits,
    bufferState,
    elementState,
    textureState,
    framebufferState,
    glState,
    uniformState,
    attributeState,
    shaderState,
    drawState,
    frameState,
    poll)

  var canvas = gl.canvas

  // raf stuff
  var rafCallbacks = []
  var activeRAF = 0
  function handleRAF () {
    activeRAF = raf.next(handleRAF)
    frameState.count += 1

    if (frameState.width !== gl.drawingBufferWidth ||
        frameState.height !== gl.drawingBufferHeight) {
      frameState.width = gl.drawingBufferWidth
      frameState.height = gl.drawingBufferHeight
      glState.notifyViewportChanged()
    }

    var now = clock()
    frameState.dt = now - frameState.t
    frameState.t = now

    textureState.poll()

    for (var i = 0; i < rafCallbacks.length; ++i) {
      var cb = rafCallbacks[i]
      cb(frameState.count, frameState.t, frameState.dt)
    }
    frameState.renderTime = clock() - now
  }

  function startRAF () {
    if (!activeRAF && rafCallbacks.length > 0) {
      handleRAF()
    }
  }

  function stopRAF () {
    if (activeRAF) {
      raf.cancel(handleRAF)
      activeRAF = 0
    }
  }

  function handleContextLoss (event) {
    stopRAF()
    event.preventDefault()
    if (options.onContextLost) {
      options.onContextLost()
    }
  }

  function handleContextRestored (event) {
    gl.getError()
    extensionState.refresh()
    bufferState.refresh()
    textureState.refresh()
    renderbufferState.refresh()
    framebufferState.refresh()
    shaderState.refresh()
    glState.refresh()
    if (options.onContextRestored) {
      options.onContextRestored()
    }
    handleRAF()
  }

  if (canvas) {
    canvas.addEventListener(CONTEXT_LOST_EVENT, handleContextLoss, false)
    canvas.addEventListener(CONTEXT_RESTORED_EVENT, handleContextRestored, false)
  }

  // Resource destructuion
  function destroy () {
    stopRAF()

    if (canvas) {
      canvas.removeEventListener(CONTEXT_LOST_EVENT, handleContextLoss)
      canvas.removeEventListener(CONTEXT_RESTORED_EVENT, handleContextRestored)
    }

    shaderState.clear()
    framebufferState.clear()
    renderbufferState.clear()
    textureState.clear()
    bufferState.clear()

    if (options.onDestroy) {
      options.onDestroy()
    }
  }

  function compileProcedure (options) {
    
    

    var hasDynamic = false

    function flattenNestedOptions (options) {
      var result = extend({}, options)
      delete result.uniforms
      delete result.attributes

      function merge (name) {
        if (name in result) {
          var child = result[name]
          delete result[name]
          Object.keys(child).forEach(function (prop) {
            result[name + '.' + prop] = child[prop]
          })
        }
      }
      merge('blend')
      merge('depth')
      merge('cull')
      merge('stencil')
      merge('polygonOffset')
      merge('scissor')
      merge('sample')

      return result
    }

    // First we separate the options into static and dynamic components
    function separateDynamic (object) {
      var staticItems = {}
      var dynamicItems = {}
      Object.keys(object).forEach(function (option) {
        var value = object[option]
        if (dynamic.isDynamic(value)) {
          hasDynamic = true
          dynamicItems[option] = dynamic.unbox(value, option)
        } else {
          staticItems[option] = value
        }
      })
      return {
        dynamic: dynamicItems,
        static: staticItems
      }
    }

    var uniforms = separateDynamic(options.uniforms || {})
    var attributes = separateDynamic(options.attributes || {})
    var opts = separateDynamic(flattenNestedOptions(options))

    var compiled = compiler.command(
      opts.static, uniforms.static, attributes.static,
      opts.dynamic, uniforms.dynamic, attributes.dynamic,
      hasDynamic)

    var draw = compiled.draw
    var batch = compiled.batch
    var scope = compiled.scope

    var EMPTY_ARRAY = []
    function reserve (count) {
      while (EMPTY_ARRAY.length < count) {
        EMPTY_ARRAY.push(null)
      }
      return EMPTY_ARRAY
    }

    function REGLCommand (args, body) {
      if (typeof args === 'number') {
        return batch(args | 0, reserve(args | 0))
      } else if (Array.isArray(args)) {
        return batch(args.length, args)
      } else if (typeof args === 'function') {
        return scope(null, args)
      } else if (typeof body === 'function') {
        return scope(args, body)
      }
      return draw(args)
    }

    return REGLCommand
  }

  function poll () {
    framebufferState.poll()
    glState.poll()
  }

  function clear (options) {
    var clearFlags = 0

    // Update context state
    poll()

    var c = options.color
    if (c) {
      gl.clearColor(+c[0] || 0, +c[1] || 0, +c[2] || 0, +c[3] || 0)
      clearFlags |= GL_COLOR_BUFFER_BIT
    }
    if ('depth' in options) {
      gl.clearDepth(+options.depth)
      clearFlags |= GL_DEPTH_BUFFER_BIT
    }
    if ('stencil' in options) {
      gl.clearStencil(options.stencil | 0)
      clearFlags |= GL_STENCIL_BUFFER_BIT
    }

    
    gl.clear(clearFlags)
  }

  // Registers another requestAnimationFrame callback
  function frame (cb) {
    rafCallbacks.push(cb)

    function cancel () {
      var index = rafCallbacks.find(function (item) {
        return item === cb
      })
      if (index < 0) {
        return
      }
      rafCallbacks.splice(index, 1)
      if (rafCallbacks.length <= 0) {
        stopRAF()
      }
    }

    startRAF()

    return {
      cancel: cancel
    }
  }

  return extend(compileProcedure, {
    // Clear current FBO
    clear: clear,

    // Short cut for prop binding
    prop: dynamic.define,

    // executes an empty draw command
    draw: compileProcedure({}),

    // Resources
    elements: function (options) {
      return elementState.create(options)
    },
    buffer: function (options) {
      return bufferState.create(options, GL_ARRAY_BUFFER)
    },
    texture: function (options) {
      return textureState.create(options, GL_TEXTURE_2D)
    },
    cube: function (options) {
      if (arguments.length === 6) {
        return textureState.create(
          Array.prototype.slice.call(arguments),
          GL_TEXTURE_CUBE_MAP)
      } else {
        return textureState.create(options, GL_TEXTURE_CUBE_MAP)
      }
    },
    renderbuffer: function (options) {
      return renderbufferState.create(options)
    },
    framebuffer: function (options) {
      return framebufferState.create(options)
    },
    framebufferCube: function (options) {
      
    },

    // Frame rendering
    frame: frame,
    stats: frameState,

    // System limits
    limits: limits,

    // Read pixels
    read: readPixels,

    // Destroy regl and all associated resources
    destroy: destroy
  })
}

},{"./lib/attribute":2,"./lib/buffer":3,"./lib/clock":4,"./lib/compile":6,"./lib/context":10,"./lib/draw":11,"./lib/dynamic":12,"./lib/elements":13,"./lib/extend":14,"./lib/extension":15,"./lib/framebuffer":16,"./lib/limits":19,"./lib/raf":22,"./lib/read":23,"./lib/renderbuffer":24,"./lib/shader":25,"./lib/state":27,"./lib/strings":28,"./lib/texture":29,"./lib/uniform":31}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJleGFtcGxlL3RoZXRhMzYwLmpzIiwibGliL2F0dHJpYnV0ZS5qcyIsImxpYi9idWZmZXIuanMiLCJsaWIvY2xvY2suanMiLCJsaWIvY29kZWdlbi5qcyIsImxpYi9jb21waWxlLmpzIiwibGliL2NvbnN0YW50cy9hcnJheXR5cGVzLmpzb24iLCJsaWIvY29uc3RhbnRzL2R0eXBlcy5qc29uIiwibGliL2NvbnN0YW50cy9wcmltaXRpdmVzLmpzb24iLCJsaWIvY29udGV4dC5qcyIsImxpYi9kcmF3LmpzIiwibGliL2R5bmFtaWMuanMiLCJsaWIvZWxlbWVudHMuanMiLCJsaWIvZXh0ZW5kLmpzIiwibGliL2V4dGVuc2lvbi5qcyIsImxpYi9mcmFtZWJ1ZmZlci5qcyIsImxpYi9pcy1uZGFycmF5LmpzIiwibGliL2lzLXR5cGVkLWFycmF5LmpzIiwibGliL2xpbWl0cy5qcyIsImxpYi9sb2FkLXRleHR1cmUuanMiLCJsaWIvcGFyc2UtZGRzLmpzIiwibGliL3JhZi5qcyIsImxpYi9yZWFkLmpzIiwibGliL3JlbmRlcmJ1ZmZlci5qcyIsImxpYi9zaGFkZXIuanMiLCJsaWIvc3RhY2suanMiLCJsaWIvc3RhdGUuanMiLCJsaWIvc3RyaW5ncy5qcyIsImxpYi90ZXh0dXJlLmpzIiwibGliL3RvLWhhbGYtZmxvYXQuanMiLCJsaWIvdW5pZm9ybS5qcyIsImxpYi92YWx1ZXMuanMiLCJub2RlX21vZHVsZXMvYW5nbGUtbm9ybWFscy9hbmdsZS1ub3JtYWxzLmpzIiwibm9kZV9tb2R1bGVzL2J1bm55L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2dsLW1hdDQvYWRqb2ludC5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L2Nsb25lLmpzIiwibm9kZV9tb2R1bGVzL2dsLW1hdDQvY29weS5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L2NyZWF0ZS5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L2RldGVybWluYW50LmpzIiwibm9kZV9tb2R1bGVzL2dsLW1hdDQvZnJvbVF1YXQuanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0NC9mcm9tUm90YXRpb25UcmFuc2xhdGlvbi5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L2ZydXN0dW0uanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0NC9pZGVudGl0eS5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2dsLW1hdDQvaW52ZXJ0LmpzIiwibm9kZV9tb2R1bGVzL2dsLW1hdDQvbG9va0F0LmpzIiwibm9kZV9tb2R1bGVzL2dsLW1hdDQvbXVsdGlwbHkuanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0NC9vcnRoby5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L3BlcnNwZWN0aXZlLmpzIiwibm9kZV9tb2R1bGVzL2dsLW1hdDQvcGVyc3BlY3RpdmVGcm9tRmllbGRPZlZpZXcuanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0NC9yb3RhdGUuanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0NC9yb3RhdGVYLmpzIiwibm9kZV9tb2R1bGVzL2dsLW1hdDQvcm90YXRlWS5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L3JvdGF0ZVouanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0NC9zY2FsZS5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L3N0ci5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L3RyYW5zbGF0ZS5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L3RyYW5zcG9zZS5qcyIsInJlZ2wuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0TkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JsREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6S0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzV0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkxBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6SkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0tBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzEzQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQkE7QUFDQTtBQUNBO0FBQ0E7O0FDSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUZBO0FBQ0E7QUFDQTs7QUNGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJjb25zdCByZWdsID0gcmVxdWlyZSgnLi4vcmVnbCcpKClcbmNvbnN0IG1hdDQgPSByZXF1aXJlKCdnbC1tYXQ0JylcbmNvbnN0IGJ1bm55ID0gcmVxdWlyZSgnYnVubnknKVxuY29uc3Qgbm9ybWFscyA9IHJlcXVpcmUoJ2FuZ2xlLW5vcm1hbHMnKVxuXG5jb25zdCBzZXR1cEVudk1hcCA9IHJlZ2woe1xuICBmcmFnOiBgXG4gIHByZWNpc2lvbiBtZWRpdW1wIGZsb2F0O1xuICB1bmlmb3JtIHNhbXBsZXIyRCBlbnZtYXA7XG4gIHZhcnlpbmcgdmVjMyByZWZsZWN0RGlyO1xuXG4gICNkZWZpbmUgUEkgJHtNYXRoLlBJfVxuXG4gIHZlYzQgbG9va3VwRW52ICh2ZWMzIGRpcikge1xuICAgIGZsb2F0IGxhdCA9IGF0YW4oZGlyLnosIGRpci54KTtcbiAgICBmbG9hdCBsb24gPSBhY29zKGRpci55IC8gbGVuZ3RoKGRpcikpO1xuICAgIHJldHVybiB0ZXh0dXJlMkQoZW52bWFwLCB2ZWMyKFxuICAgICAgMC41ICsgbGF0IC8gKDIuMCAqIFBJKSxcbiAgICAgIGxvbiAvIFBJKSk7XG4gIH1cblxuICB2b2lkIG1haW4gKCkge1xuICAgIGdsX0ZyYWdDb2xvciA9IGxvb2t1cEVudihyZWZsZWN0RGlyKTtcbiAgfWAsXG5cbiAgdmVydDogYFxuICBwcmVjaXNpb24gbWVkaXVtcCBmbG9hdDtcbiAgdmFyeWluZyB2ZWMzIHJlZmxlY3REaXI7XG4gIHZvaWQgbWFpbigpIHsgZ2xfUG9zaXRpb24gPSB2ZWM0KDAsMCwwLDApOyB9XG4gIGAsXG5cbiAgdW5pZm9ybXM6IHtcbiAgICBlbnZtYXA6IHJlZ2wudGV4dHVyZSgnYXNzZXRzL29nZC1vcmVnb24tMzYwLmpwZycpLFxuXG4gICAgdmlldzogcmVnbC5wcm9wKCd2aWV3JyksXG5cbiAgICBwcm9qZWN0aW9uOiAoYXJncywgYmF0Y2hJZCwge3dpZHRoLCBoZWlndGh9KSA9PlxuICAgICAgbWF0NC5wZXJzcGVjdGl2ZShbXSxcbiAgICAgICAgTWF0aC5QSSAvIDQsXG4gICAgICAgIHJlZ2wuc3RhdHMud2lkdGggLyByZWdsLnN0YXRzLmhlaWdodCxcbiAgICAgICAgMC4wMSxcbiAgICAgICAgMTAwMCksXG5cbiAgICBpbnZWaWV3OiAoe3ZpZXd9KSA9PiBtYXQ0LmludmVydChbXSwgdmlldylcbiAgfVxufSlcblxuY29uc3QgZHJhd0JhY2tncm91bmQgPSByZWdsKHtcbiAgdmVydDogYFxuICBwcmVjaXNpb24gbWVkaXVtcCBmbG9hdDtcbiAgYXR0cmlidXRlIHZlYzIgcG9zaXRpb247XG4gIHVuaWZvcm0gbWF0NCB2aWV3O1xuICB2YXJ5aW5nIHZlYzMgcmVmbGVjdERpcjtcbiAgdm9pZCBtYWluKCkge1xuICAgIHJlZmxlY3REaXIgPSAodmlldyAqIHZlYzQocG9zaXRpb24sIDEsIDApKS54eXo7XG4gICAgZ2xfUG9zaXRpb24gPSB2ZWM0KHBvc2l0aW9uLCAwLCAxKTtcbiAgfWAsXG5cbiAgYXR0cmlidXRlczoge1xuICAgIHBvc2l0aW9uOiByZWdsLmJ1ZmZlcihbXG4gICAgICAtNCwgLTQsXG4gICAgICAtNCwgNCxcbiAgICAgIDgsIDBdKVxuICB9LFxuXG4gIGRlcHRoOiB7XG4gICAgbWFzazogZmFsc2UsXG4gICAgZW5hYmxlOiBmYWxzZVxuICB9LFxuXG4gIGNvdW50OiAzXG59KVxuXG5jb25zdCBkcmF3QnVubnkgPSByZWdsKHtcbiAgdmVydDogYFxuICBwcmVjaXNpb24gbWVkaXVtcCBmbG9hdDtcbiAgYXR0cmlidXRlIHZlYzMgcG9zaXRpb24sIG5vcm1hbDtcbiAgdW5pZm9ybSBtYXQ0IHByb2plY3Rpb24sIHZpZXcsIGludlZpZXc7XG4gIHZhcnlpbmcgdmVjMyByZWZsZWN0RGlyO1xuICB2b2lkIG1haW4oKSB7XG4gICAgdmVjNCBleWUgPSBpbnZWaWV3ICogdmVjNCgwLCAwLCAwLCAxKTtcbiAgICByZWZsZWN0RGlyID0gcmVmbGVjdChcbiAgICAgIG5vcm1hbGl6ZShwb3NpdGlvbi54eXogLSBleWUueHl6IC8gZXllLncpLFxuICAgICAgbm9ybWFsKTtcbiAgICBnbF9Qb3NpdGlvbiA9IHByb2plY3Rpb24gKiB2aWV3ICogdmVjNChwb3NpdGlvbiwgMSk7XG4gIH1gLFxuXG4gIGF0dHJpYnV0ZXM6IHtcbiAgICBwb3NpdGlvbjogcmVnbC5idWZmZXIoYnVubnkucG9zaXRpb25zKSxcbiAgICBub3JtYWw6IHJlZ2wuYnVmZmVyKG5vcm1hbHMoYnVubnkuY2VsbHMsIGJ1bm55LnBvc2l0aW9ucykpXG4gIH0sXG5cbiAgZWxlbWVudHM6IHJlZ2wuZWxlbWVudHMoYnVubnkuY2VsbHMpXG59KVxuXG5yZWdsLmZyYW1lKCgpID0+IHtcbiAgY29uc3QgdCA9IDAuMDEgKiByZWdsLnN0YXRzLmNvdW50XG5cbiAgc2V0dXBFbnZNYXAoe1xuICAgIHZpZXc6IG1hdDQubG9va0F0KFtdLFxuICAgICAgWzMwICogTWF0aC5jb3ModCksIDIuNSwgMzAgKiBNYXRoLnNpbih0KV0sXG4gICAgICBbMCwgMi41LCAwXSxcbiAgICAgIFswLCAxLCAwXSlcbiAgfSwgKCkgPT4ge1xuICAgIGRyYXdCYWNrZ3JvdW5kKClcbiAgICBkcmF3QnVubnkoKVxuICB9KVxufSlcbiIsInZhciBnbFR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvZHR5cGVzLmpzb24nKVxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vZXh0ZW5kJylcblxudmFyIEdMX0ZMT0FUID0gNTEyNlxuXG5mdW5jdGlvbiBBdHRyaWJ1dGVSZWNvcmQgKCkge1xuICB0aGlzLnBvaW50ZXIgPSBmYWxzZVxuXG4gIHRoaXMueCA9IDAuMFxuICB0aGlzLnkgPSAwLjBcbiAgdGhpcy56ID0gMC4wXG4gIHRoaXMudyA9IDAuMFxuXG4gIHRoaXMuYnVmZmVyID0gbnVsbFxuICB0aGlzLnNpemUgPSAwXG4gIHRoaXMubm9ybWFsaXplZCA9IGZhbHNlXG4gIHRoaXMudHlwZSA9IEdMX0ZMT0FUXG4gIHRoaXMub2Zmc2V0ID0gMFxuICB0aGlzLnN0cmlkZSA9IDBcbiAgdGhpcy5kaXZpc29yID0gMFxufVxuXG5leHRlbmQoQXR0cmlidXRlUmVjb3JkLnByb3RvdHlwZSwge1xuICBlcXVhbHM6IGZ1bmN0aW9uIChvdGhlciwgc2l6ZSkge1xuICAgIGlmICghdGhpcy5wb2ludGVyKSB7XG4gICAgICByZXR1cm4gIW90aGVyLnBvaW50ZXIgJiZcbiAgICAgICAgdGhpcy54ID09PSBvdGhlci54ICYmXG4gICAgICAgIHRoaXMueSA9PT0gb3RoZXIueSAmJlxuICAgICAgICB0aGlzLnogPT09IG90aGVyLnogJiZcbiAgICAgICAgdGhpcy53ID09PSBvdGhlci53XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBvdGhlci5wb2ludGVyICYmXG4gICAgICAgIHRoaXMuYnVmZmVyID09PSBvdGhlci5idWZmZXIgJiZcbiAgICAgICAgdGhpcy5zaXplID09PSBzaXplICYmXG4gICAgICAgIHRoaXMubm9ybWFsaXplZCA9PT0gb3RoZXIubm9ybWFsaXplZCAmJlxuICAgICAgICB0aGlzLnR5cGUgPT09IG90aGVyLnR5cGUgJiZcbiAgICAgICAgdGhpcy5vZmZzZXQgPT09IG90aGVyLm9mZnNldCAmJlxuICAgICAgICB0aGlzLnN0cmlkZSA9PT0gb3RoZXIuc3RyaWRlICYmXG4gICAgICAgIHRoaXMuZGl2aXNvciA9PT0gb3RoZXIuZGl2aXNvclxuICAgIH1cbiAgfSxcblxuICBzZXQ6IGZ1bmN0aW9uIChvdGhlciwgc2l6ZSkge1xuICAgIHZhciBwb2ludGVyID0gdGhpcy5wb2ludGVyID0gb3RoZXIucG9pbnRlclxuICAgIGlmIChwb2ludGVyKSB7XG4gICAgICB0aGlzLmJ1ZmZlciA9IG90aGVyLmJ1ZmZlclxuICAgICAgdGhpcy5zaXplID0gc2l6ZVxuICAgICAgdGhpcy5ub3JtYWxpemVkID0gb3RoZXIubm9ybWFsaXplZFxuICAgICAgdGhpcy50eXBlID0gb3RoZXIudHlwZVxuICAgICAgdGhpcy5vZmZzZXQgPSBvdGhlci5vZmZzZXRcbiAgICAgIHRoaXMuc3RyaWRlID0gb3RoZXIuc3RyaWRlXG4gICAgICB0aGlzLmRpdmlzb3IgPSBvdGhlci5kaXZpc29yXG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMueCA9IG90aGVyLnhcbiAgICAgIHRoaXMueSA9IG90aGVyLnlcbiAgICAgIHRoaXMueiA9IG90aGVyLnpcbiAgICAgIHRoaXMudyA9IG90aGVyLndcbiAgICB9XG4gIH1cbn0pXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcEF0dHJpYnV0ZVN0YXRlIChcbiAgZ2wsXG4gIGV4dGVuc2lvbnMsXG4gIGxpbWl0cyxcbiAgYnVmZmVyU3RhdGUsXG4gIHN0cmluZ1N0b3JlKSB7XG5cbiAgdmFyIGF0dHJpYnV0ZVN0YXRlID0ge31cblxuICB2YXIgTlVNX0FUVFJJQlVURVMgPSBsaW1pdHMubWF4QXR0cmlidXRlc1xuICB2YXIgYXR0cmlidXRlQmluZGluZ3MgPSBuZXcgQXJyYXkoTlVNX0FUVFJJQlVURVMpXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgTlVNX0FUVFJJQlVURVM7ICsraSkge1xuICAgIGF0dHJpYnV0ZUJpbmRpbmdzW2ldID0gbmV3IEF0dHJpYnV0ZVJlY29yZCgpXG4gIH1cblxuICBmdW5jdGlvbiBBdHRyaWJ1dGVTdGFjayAoKSB7XG4gICAgdmFyIHJlY29yZHMgPSBuZXcgQXJyYXkoMTYpXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCAxNjsgKytpKSB7XG4gICAgICByZWNvcmRzW2ldID0gbmV3IEF0dHJpYnV0ZVJlY29yZCgpXG4gICAgfVxuICAgIHRoaXMucmVjb3JkcyA9IHJlY29yZHNcbiAgICB0aGlzLnRvcCA9IDBcbiAgfVxuXG4gIGZ1bmN0aW9uIHB1c2hBdHRyaWJ1dGVTdGFjayAoc3RhY2spIHtcbiAgICB2YXIgcmVjb3JkcyA9IHN0YWNrLnJlY29yZHNcbiAgICB2YXIgdG9wID0gc3RhY2sudG9wXG5cbiAgICB3aGlsZSAocmVjb3Jkcy5sZW5ndGggLSAxIDw9IHRvcCkge1xuICAgICAgcmVjb3Jkcy5wdXNoKG5ldyBBdHRyaWJ1dGVSZWNvcmQoKSlcbiAgICB9XG5cbiAgICByZXR1cm4gcmVjb3Jkc1srK3N0YWNrLnRvcF1cbiAgfVxuXG4gIGV4dGVuZChBdHRyaWJ1dGVTdGFjay5wcm90b3R5cGUsIHtcbiAgICBwdXNoVmVjOiBmdW5jdGlvbiAoeCwgeSwgeiwgdykge1xuICAgICAgdmFyIGhlYWQgPSBwdXNoQXR0cmlidXRlU3RhY2sodGhpcylcbiAgICAgIGhlYWQucG9pbnRlciA9IGZhbHNlXG4gICAgICBoZWFkLnggPSB4XG4gICAgICBoZWFkLnkgPSB5XG4gICAgICBoZWFkLnogPSB6XG4gICAgICBoZWFkLncgPSB3XG4gICAgfSxcblxuICAgIHB1c2hQdHI6IGZ1bmN0aW9uIChcbiAgICAgIGJ1ZmZlcixcbiAgICAgIHNpemUsXG4gICAgICBvZmZzZXQsXG4gICAgICBzdHJpZGUsXG4gICAgICBkaXZpc29yLFxuICAgICAgbm9ybWFsaXplZCxcbiAgICAgIHR5cGUpIHtcbiAgICAgIHZhciBoZWFkID0gcHVzaEF0dHJpYnV0ZVN0YWNrKHRoaXMpXG4gICAgICBoZWFkLnBvaW50ZXIgPSB0cnVlXG4gICAgICBoZWFkLmJ1ZmZlciA9IGJ1ZmZlclxuICAgICAgaGVhZC5zaXplID0gc2l6ZVxuICAgICAgaGVhZC5vZmZzZXQgPSBvZmZzZXRcbiAgICAgIGhlYWQuc3RyaWRlID0gc3RyaWRlXG4gICAgICBoZWFkLmRpdmlzb3IgPSBkaXZpc29yXG4gICAgICBoZWFkLm5vcm1hbGl6ZWQgPSBub3JtYWxpemVkXG4gICAgICBoZWFkLnR5cGUgPSB0eXBlXG4gICAgfSxcblxuICAgIHB1c2hEeW46IGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICBpZiAodHlwZW9mIGRhdGEgPT09ICdudW1iZXInKSB7XG4gICAgICAgIHRoaXMucHVzaFZlYyhkYXRhLCAwLCAwLCAwKVxuICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XG4gICAgICAgIHRoaXMucHVzaFZlYyhkYXRhWzBdLCBkYXRhWzFdLCBkYXRhWzJdLCBkYXRhWzNdKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcihkYXRhKVxuICAgICAgICB2YXIgc2l6ZSA9IDBcbiAgICAgICAgdmFyIHN0cmlkZSA9IDBcbiAgICAgICAgdmFyIG9mZnNldCA9IDBcbiAgICAgICAgdmFyIGRpdmlzb3IgPSAwXG4gICAgICAgIHZhciBub3JtYWxpemVkID0gZmFsc2VcbiAgICAgICAgdmFyIHR5cGUgPSBHTF9GTE9BVFxuICAgICAgICBpZiAoIWJ1ZmZlcikge1xuICAgICAgICAgIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcihkYXRhLmJ1ZmZlcilcbiAgICAgICAgICBzaXplID0gZGF0YS5zaXplIHx8IDBcbiAgICAgICAgICBzdHJpZGUgPSBkYXRhLnN0cmlkZSB8fCAwXG4gICAgICAgICAgb2Zmc2V0ID0gZGF0YS5vZmZzZXQgfHwgMFxuICAgICAgICAgIGRpdmlzb3IgPSBkYXRhLmRpdmlzb3IgfHwgMFxuICAgICAgICAgIG5vcm1hbGl6ZWQgPSBkYXRhLm5vcm1hbGl6ZWQgfHwgZmFsc2VcbiAgICAgICAgICB0eXBlID0gYnVmZmVyLmR0eXBlXG4gICAgICAgICAgaWYgKCd0eXBlJyBpbiBkYXRhKSB7XG4gICAgICAgICAgICB0eXBlID0gZ2xUeXBlc1tkYXRhLnR5cGVdXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHR5cGUgPSBidWZmZXIuZHR5cGVcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnB1c2hQdHIoYnVmZmVyLCBzaXplLCBvZmZzZXQsIHN0cmlkZSwgZGl2aXNvciwgbm9ybWFsaXplZCwgdHlwZSlcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgcG9wOiBmdW5jdGlvbiAoKSB7XG4gICAgICB0aGlzLnRvcCAtPSAxXG4gICAgfVxuICB9KVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBCSU5EIEFOIEFUVFJJQlVURVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgZnVuY3Rpb24gYmluZEF0dHJpYnV0ZSAoaW5kZXgsIGN1cnJlbnQsIG5leHQsIHNpemUpIHtcbiAgICBzaXplID0gbmV4dC5zaXplIHx8IHNpemVcbiAgICBpZiAoY3VycmVudC5lcXVhbHMobmV4dCwgc2l6ZSkpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBpZiAoIW5leHQucG9pbnRlcikge1xuICAgICAgaWYgKGN1cnJlbnQucG9pbnRlcikge1xuICAgICAgICBnbC5kaXNhYmxlVmVydGV4QXR0cmliQXJyYXkoaW5kZXgpXG4gICAgICB9XG4gICAgICBnbC52ZXJ0ZXhBdHRyaWI0ZihpbmRleCwgbmV4dC54LCBuZXh0LnksIG5leHQueiwgbmV4dC53KVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoIWN1cnJlbnQucG9pbnRlcikge1xuICAgICAgICBnbC5lbmFibGVWZXJ0ZXhBdHRyaWJBcnJheShpbmRleClcbiAgICAgIH1cbiAgICAgIGlmIChjdXJyZW50LmJ1ZmZlciAhPT0gbmV4dC5idWZmZXIpIHtcbiAgICAgICAgbmV4dC5idWZmZXIuYmluZCgpXG4gICAgICB9XG4gICAgICBnbC52ZXJ0ZXhBdHRyaWJQb2ludGVyKFxuICAgICAgICBpbmRleCxcbiAgICAgICAgc2l6ZSxcbiAgICAgICAgbmV4dC50eXBlLFxuICAgICAgICBuZXh0Lm5vcm1hbGl6ZWQsXG4gICAgICAgIG5leHQuc3RyaWRlLFxuICAgICAgICBuZXh0Lm9mZnNldClcbiAgICAgIHZhciBleHRJbnN0YW5jaW5nID0gZXh0ZW5zaW9ucy5hbmdsZV9pbnN0YW5jZWRfYXJyYXlzXG4gICAgICBpZiAoZXh0SW5zdGFuY2luZykge1xuICAgICAgICBleHRJbnN0YW5jaW5nLnZlcnRleEF0dHJpYkRpdmlzb3JBTkdMRShpbmRleCwgbmV4dC5kaXZpc29yKVxuICAgICAgfVxuICAgIH1cbiAgICBjdXJyZW50LnNldChuZXh0LCBzaXplKVxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIERFRklORSBBIE5FVyBBVFRSSUJVVEVcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGRlZkF0dHJpYnV0ZSAobmFtZSkge1xuICAgIHZhciBpZCA9IHN0cmluZ1N0b3JlLmlkKG5hbWUpXG4gICAgdmFyIHJlc3VsdCA9IGF0dHJpYnV0ZVN0YXRlW2lkXVxuICAgIGlmICghcmVzdWx0KSB7XG4gICAgICByZXN1bHQgPSBhdHRyaWJ1dGVTdGF0ZVtpZF0gPSBuZXcgQXR0cmlidXRlU3RhY2soKVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGJpbmRpbmdzOiBhdHRyaWJ1dGVCaW5kaW5ncyxcbiAgICBiaW5kOiBiaW5kQXR0cmlidXRlLFxuICAgIGRlZjogZGVmQXR0cmlidXRlXG4gIH1cbn1cbiIsIi8vIEFycmF5IGFuZCBlbGVtZW50IGJ1ZmZlciBjcmVhdGlvblxuXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi9pcy10eXBlZC1hcnJheScpXG52YXIgaXNOREFycmF5TGlrZSA9IHJlcXVpcmUoJy4vaXMtbmRhcnJheScpXG52YXIgYXJyYXlUeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL2FycmF5dHlwZXMuanNvbicpXG52YXIgYnVmZmVyVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9kdHlwZXMuanNvbicpXG52YXIgdmFsdWVzID0gcmVxdWlyZSgnLi92YWx1ZXMnKVxuXG52YXIgR0xfU1RBVElDX0RSQVcgPSAzNTA0NFxuXG52YXIgR0xfQllURSA9IDUxMjBcbnZhciBHTF9VTlNJR05FRF9CWVRFID0gNTEyMVxudmFyIEdMX1NIT1JUID0gNTEyMlxudmFyIEdMX1VOU0lHTkVEX1NIT1JUID0gNTEyM1xudmFyIEdMX0lOVCA9IDUxMjRcbnZhciBHTF9VTlNJR05FRF9JTlQgPSA1MTI1XG52YXIgR0xfRkxPQVQgPSA1MTI2XG5cbnZhciB1c2FnZVR5cGVzID0ge1xuICAnc3RhdGljJzogMzUwNDQsXG4gICdkeW5hbWljJzogMzUwNDgsXG4gICdzdHJlYW0nOiAzNTA0MFxufVxuXG5mdW5jdGlvbiB0eXBlZEFycmF5Q29kZSAoZGF0YSkge1xuICByZXR1cm4gYXJyYXlUeXBlc1tPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoZGF0YSldIHwgMFxufVxuXG5mdW5jdGlvbiBtYWtlVHlwZWRBcnJheSAoZHR5cGUsIGFyZ3MpIHtcbiAgc3dpdGNoIChkdHlwZSkge1xuICAgIGNhc2UgR0xfVU5TSUdORURfQllURTpcbiAgICAgIHJldHVybiBuZXcgVWludDhBcnJheShhcmdzKVxuICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlQ6XG4gICAgICByZXR1cm4gbmV3IFVpbnQxNkFycmF5KGFyZ3MpXG4gICAgY2FzZSBHTF9VTlNJR05FRF9JTlQ6XG4gICAgICByZXR1cm4gbmV3IFVpbnQzMkFycmF5KGFyZ3MpXG4gICAgY2FzZSBHTF9CWVRFOlxuICAgICAgcmV0dXJuIG5ldyBJbnQ4QXJyYXkoYXJncylcbiAgICBjYXNlIEdMX1NIT1JUOlxuICAgICAgcmV0dXJuIG5ldyBJbnQxNkFycmF5KGFyZ3MpXG4gICAgY2FzZSBHTF9JTlQ6XG4gICAgICByZXR1cm4gbmV3IEludDMyQXJyYXkoYXJncylcbiAgICBjYXNlIEdMX0ZMT0FUOlxuICAgICAgcmV0dXJuIG5ldyBGbG9hdDMyQXJyYXkoYXJncylcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIG51bGxcbiAgfVxufVxuXG5mdW5jdGlvbiBmbGF0dGVuIChyZXN1bHQsIGRhdGEsIGRpbWVuc2lvbikge1xuICB2YXIgcHRyID0gMFxuICBmb3IgKHZhciBpID0gMDsgaSA8IGRhdGEubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgdiA9IGRhdGFbaV1cbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IGRpbWVuc2lvbjsgKytqKSB7XG4gICAgICByZXN1bHRbcHRyKytdID0gdltqXVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiB0cmFuc3Bvc2UgKHJlc3VsdCwgZGF0YSwgc2hhcGVYLCBzaGFwZVksIHN0cmlkZVgsIHN0cmlkZVksIG9mZnNldCkge1xuICB2YXIgcHRyID0gMFxuICBmb3IgKHZhciBpID0gMDsgaSA8IHNoYXBlWDsgKytpKSB7XG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBzaGFwZVk7ICsraikge1xuICAgICAgcmVzdWx0W3B0cisrXSA9IGRhdGFbc3RyaWRlWCAqIGkgKyBzdHJpZGVZICogaiArIG9mZnNldF1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBCdWZmZXJTdGF0ZSAoZ2wpIHtcbiAgdmFyIGJ1ZmZlckNvdW50ID0gMFxuICB2YXIgYnVmZmVyU2V0ID0ge31cblxuICBmdW5jdGlvbiBSRUdMQnVmZmVyIChidWZmZXIsIHR5cGUpIHtcbiAgICB0aGlzLmlkID0gYnVmZmVyQ291bnQrK1xuICAgIHRoaXMuYnVmZmVyID0gYnVmZmVyXG4gICAgdGhpcy50eXBlID0gdHlwZVxuICAgIHRoaXMudXNhZ2UgPSBHTF9TVEFUSUNfRFJBV1xuICAgIHRoaXMuYnl0ZUxlbmd0aCA9IDBcbiAgICB0aGlzLmRpbWVuc2lvbiA9IDFcbiAgICB0aGlzLmRhdGEgPSBudWxsXG4gICAgdGhpcy5kdHlwZSA9IEdMX1VOU0lHTkVEX0JZVEVcbiAgfVxuXG4gIFJFR0xCdWZmZXIucHJvdG90eXBlLmJpbmQgPSBmdW5jdGlvbiAoKSB7XG4gICAgZ2wuYmluZEJ1ZmZlcih0aGlzLnR5cGUsIHRoaXMuYnVmZmVyKVxuICB9XG5cbiAgZnVuY3Rpb24gcmVmcmVzaCAoYnVmZmVyKSB7XG4gICAgaWYgKCFnbC5pc0J1ZmZlcihidWZmZXIuYnVmZmVyKSkge1xuICAgICAgYnVmZmVyLmJ1ZmZlciA9IGdsLmNyZWF0ZUJ1ZmZlcigpXG4gICAgfVxuICAgIGJ1ZmZlci5iaW5kKClcbiAgICBnbC5idWZmZXJEYXRhKGJ1ZmZlci50eXBlLCBidWZmZXIuZGF0YSB8fCBidWZmZXIuYnl0ZUxlbmd0aCwgYnVmZmVyLnVzYWdlKVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAoYnVmZmVyKSB7XG4gICAgdmFyIGhhbmRsZSA9IGJ1ZmZlci5idWZmZXJcbiAgICBcbiAgICBpZiAoZ2wuaXNCdWZmZXIoaGFuZGxlKSkge1xuICAgICAgZ2wuZGVsZXRlQnVmZmVyKGhhbmRsZSlcbiAgICB9XG4gICAgYnVmZmVyLmJ1ZmZlciA9IG51bGxcbiAgICBkZWxldGUgYnVmZmVyU2V0W2J1ZmZlci5pZF1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZUJ1ZmZlciAob3B0aW9ucywgdHlwZSwgZGVmZXJJbml0KSB7XG4gICAgdmFyIGhhbmRsZSA9IGdsLmNyZWF0ZUJ1ZmZlcigpXG5cbiAgICB2YXIgYnVmZmVyID0gbmV3IFJFR0xCdWZmZXIoaGFuZGxlLCB0eXBlKVxuICAgIGJ1ZmZlclNldFtidWZmZXIuaWRdID0gYnVmZmVyXG5cbiAgICBmdW5jdGlvbiByZWdsQnVmZmVyIChpbnB1dCkge1xuICAgICAgdmFyIG9wdGlvbnMgPSBpbnB1dCB8fCB7fVxuICAgICAgaWYgKEFycmF5LmlzQXJyYXkob3B0aW9ucykgfHxcbiAgICAgICAgICBpc1R5cGVkQXJyYXkob3B0aW9ucykgfHxcbiAgICAgICAgICBpc05EQXJyYXlMaWtlKG9wdGlvbnMpKSB7XG4gICAgICAgIG9wdGlvbnMgPSB7XG4gICAgICAgICAgZGF0YTogb3B0aW9uc1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBvcHRpb25zID09PSAnbnVtYmVyJykge1xuICAgICAgICBvcHRpb25zID0ge1xuICAgICAgICAgIGxlbmd0aDogb3B0aW9ucyB8IDBcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChvcHRpb25zID09PSBudWxsIHx8IG9wdGlvbnMgPT09IHZvaWQgMCkge1xuICAgICAgICBvcHRpb25zID0ge31cbiAgICAgIH1cblxuICAgICAgXG5cbiAgICAgIGlmICgndXNhZ2UnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHVzYWdlID0gb3B0aW9ucy51c2FnZVxuICAgICAgICBcbiAgICAgICAgYnVmZmVyLnVzYWdlID0gdXNhZ2VUeXBlc1tvcHRpb25zLnVzYWdlXVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYnVmZmVyLnVzYWdlID0gR0xfU1RBVElDX0RSQVdcbiAgICAgIH1cblxuICAgICAgdmFyIGR0eXBlID0gMFxuICAgICAgaWYgKCd0eXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIFxuICAgICAgICBkdHlwZSA9IGJ1ZmZlclR5cGVzW29wdGlvbnMudHlwZV1cbiAgICAgIH1cblxuICAgICAgdmFyIGRpbWVuc2lvbiA9IChvcHRpb25zLmRpbWVuc2lvbiB8IDApIHx8IDFcbiAgICAgIHZhciBieXRlTGVuZ3RoID0gMFxuICAgICAgdmFyIGRhdGEgPSBudWxsXG4gICAgICBpZiAoJ2RhdGEnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgZGF0YSA9IG9wdGlvbnMuZGF0YVxuICAgICAgICBpZiAoZGF0YSA9PT0gbnVsbCkge1xuICAgICAgICAgIGJ5dGVMZW5ndGggPSBvcHRpb25zLmxlbmd0aCB8IDBcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAoaXNOREFycmF5TGlrZShkYXRhKSkge1xuICAgICAgICAgICAgdmFyIHNoYXBlID0gZGF0YS5zaGFwZVxuICAgICAgICAgICAgdmFyIHN0cmlkZSA9IGRhdGEuc3RyaWRlXG4gICAgICAgICAgICB2YXIgb2Zmc2V0ID0gZGF0YS5vZmZzZXRcblxuICAgICAgICAgICAgdmFyIHNoYXBlWCA9IDBcbiAgICAgICAgICAgIHZhciBzaGFwZVkgPSAwXG4gICAgICAgICAgICB2YXIgc3RyaWRlWCA9IDBcbiAgICAgICAgICAgIHZhciBzdHJpZGVZID0gMFxuICAgICAgICAgICAgaWYgKHNoYXBlLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgICBzaGFwZVggPSBzaGFwZVswXVxuICAgICAgICAgICAgICBzaGFwZVkgPSAxXG4gICAgICAgICAgICAgIHN0cmlkZVggPSBzdHJpZGVbMF1cbiAgICAgICAgICAgICAgc3RyaWRlWSA9IDBcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc2hhcGUubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgICAgIHNoYXBlWCA9IHNoYXBlWzBdXG4gICAgICAgICAgICAgIHNoYXBlWSA9IHNoYXBlWzFdXG4gICAgICAgICAgICAgIHN0cmlkZVggPSBzdHJpZGVbMF1cbiAgICAgICAgICAgICAgc3RyaWRlWSA9IHN0cmlkZVsxXVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGR0eXBlID0gZHR5cGUgfHwgdHlwZWRBcnJheUNvZGUoZGF0YSkgfHwgR0xfRkxPQVRcbiAgICAgICAgICAgIGRpbWVuc2lvbiA9IHNoYXBlWVxuICAgICAgICAgICAgZGF0YSA9IHRyYW5zcG9zZShcbiAgICAgICAgICAgICAgbWFrZVR5cGVkQXJyYXkoZHR5cGUsIHNoYXBlWCAqIHNoYXBlWSksXG4gICAgICAgICAgICAgIGRhdGEuZGF0YSxcbiAgICAgICAgICAgICAgc2hhcGVYLCBzaGFwZVksXG4gICAgICAgICAgICAgIHN0cmlkZVgsIHN0cmlkZVksXG4gICAgICAgICAgICAgIG9mZnNldClcbiAgICAgICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcbiAgICAgICAgICAgIGlmIChkYXRhLmxlbmd0aCA+IDAgJiYgQXJyYXkuaXNBcnJheShkYXRhWzBdKSkge1xuICAgICAgICAgICAgICBkaW1lbnNpb24gPSBkYXRhWzBdLmxlbmd0aFxuICAgICAgICAgICAgICBkdHlwZSA9IGR0eXBlIHx8IEdMX0ZMT0FUXG4gICAgICAgICAgICAgIHZhciByZXN1bHQgPSBtYWtlVHlwZWRBcnJheShkdHlwZSwgZGF0YS5sZW5ndGggKiBkaW1lbnNpb24pXG4gICAgICAgICAgICAgIGRhdGEgPSBmbGF0dGVuKHJlc3VsdCwgZGF0YSwgZGltZW5zaW9uKVxuICAgICAgICAgICAgICBkYXRhID0gcmVzdWx0XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBkdHlwZSA9IGR0eXBlIHx8IEdMX0ZMT0FUXG4gICAgICAgICAgICAgIGRhdGEgPSBtYWtlVHlwZWRBcnJheShkdHlwZSwgZGF0YSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBkdHlwZSA9IGR0eXBlIHx8IHR5cGVkQXJyYXlDb2RlKGRhdGEpXG4gICAgICAgICAgfVxuICAgICAgICAgIGJ5dGVMZW5ndGggPSBkYXRhLmJ5dGVMZW5ndGhcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICgnbGVuZ3RoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIGJ5dGVMZW5ndGggPSBvcHRpb25zLmxlbmd0aCB8IDBcbiAgICAgICAgXG4gICAgICB9XG5cbiAgICAgIGJ1ZmZlci5kYXRhID0gZGF0YVxuICAgICAgYnVmZmVyLmR0eXBlID0gZHR5cGUgfHwgR0xfVU5TSUdORURfQllURVxuICAgICAgYnVmZmVyLmJ5dGVMZW5ndGggPSBieXRlTGVuZ3RoXG4gICAgICBidWZmZXIuZGltZW5zaW9uID0gZGltZW5zaW9uXG5cbiAgICAgIHJlZnJlc2goYnVmZmVyKVxuXG4gICAgICByZXR1cm4gcmVnbEJ1ZmZlclxuICAgIH1cblxuICAgIGlmICghZGVmZXJJbml0KSB7XG4gICAgICByZWdsQnVmZmVyKG9wdGlvbnMpXG4gICAgfVxuXG4gICAgcmVnbEJ1ZmZlci5fcmVnbFR5cGUgPSAnYnVmZmVyJ1xuICAgIHJlZ2xCdWZmZXIuX2J1ZmZlciA9IGJ1ZmZlclxuICAgIHJlZ2xCdWZmZXIuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHsgZGVzdHJveShidWZmZXIpIH1cblxuICAgIHJldHVybiByZWdsQnVmZmVyXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNyZWF0ZTogY3JlYXRlQnVmZmVyLFxuXG4gICAgY2xlYXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhbHVlcyhidWZmZXJTZXQpLmZvckVhY2goZGVzdHJveSlcbiAgICB9LFxuXG4gICAgcmVmcmVzaDogZnVuY3Rpb24gKCkge1xuICAgICAgdmFsdWVzKGJ1ZmZlclNldCkuZm9yRWFjaChyZWZyZXNoKVxuICAgIH0sXG5cbiAgICBnZXRCdWZmZXI6IGZ1bmN0aW9uICh3cmFwcGVyKSB7XG4gICAgICBpZiAod3JhcHBlciAmJiB3cmFwcGVyLl9idWZmZXIgaW5zdGFuY2VvZiBSRUdMQnVmZmVyKSB7XG4gICAgICAgIHJldHVybiB3cmFwcGVyLl9idWZmZXJcbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuICB9XG59XG4iLCIvKiBnbG9iYWxzIHBlcmZvcm1hbmNlICovXG5tb2R1bGUuZXhwb3J0cyA9XG4gICh0eXBlb2YgcGVyZm9ybWFuY2UgIT09ICd1bmRlZmluZWQnICYmIHBlcmZvcm1hbmNlLm5vdylcbiAgPyBmdW5jdGlvbiAoKSB7IHJldHVybiBwZXJmb3JtYW5jZS5ub3coKSB9XG4gIDogZnVuY3Rpb24gKCkgeyByZXR1cm4gKyhuZXcgRGF0ZSgpKSB9XG4iLCJ2YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi9leHRlbmQnKVxuXG5mdW5jdGlvbiBzbGljZSAoeCkge1xuICByZXR1cm4gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoeClcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjcmVhdGVFbnZpcm9ubWVudCAoKSB7XG4gIC8vIFVuaXF1ZSB2YXJpYWJsZSBpZCBjb3VudGVyXG4gIHZhciB2YXJDb3VudGVyID0gMFxuXG4gIC8vIExpbmtlZCB2YWx1ZXMgYXJlIHBhc3NlZCBmcm9tIHRoaXMgc2NvcGUgaW50byB0aGUgZ2VuZXJhdGVkIGNvZGUgYmxvY2tcbiAgLy8gQ2FsbGluZyBsaW5rKCkgcGFzc2VzIGEgdmFsdWUgaW50byB0aGUgZ2VuZXJhdGVkIHNjb3BlIGFuZCByZXR1cm5zXG4gIC8vIHRoZSB2YXJpYWJsZSBuYW1lIHdoaWNoIGl0IGlzIGJvdW5kIHRvXG4gIHZhciBsaW5rZWROYW1lcyA9IFtdXG4gIHZhciBsaW5rZWRWYWx1ZXMgPSBbXVxuICBmdW5jdGlvbiBsaW5rICh2YWx1ZSkge1xuICAgIHZhciBuYW1lID0gJ2cnICsgKHZhckNvdW50ZXIrKylcbiAgICBsaW5rZWROYW1lcy5wdXNoKG5hbWUpXG4gICAgbGlua2VkVmFsdWVzLnB1c2godmFsdWUpXG4gICAgcmV0dXJuIG5hbWVcbiAgfVxuXG4gIC8vIGNyZWF0ZSBhIGNvZGUgYmxvY2tcbiAgZnVuY3Rpb24gYmxvY2sgKCkge1xuICAgIHZhciBjb2RlID0gW11cbiAgICBmdW5jdGlvbiBwdXNoICgpIHtcbiAgICAgIGNvZGUucHVzaC5hcHBseShjb2RlLCBzbGljZShhcmd1bWVudHMpKVxuICAgIH1cblxuICAgIHZhciB2YXJzID0gW11cbiAgICBmdW5jdGlvbiBkZWYgKCkge1xuICAgICAgdmFyIG5hbWUgPSAndicgKyAodmFyQ291bnRlcisrKVxuICAgICAgdmFycy5wdXNoKG5hbWUpXG5cbiAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb2RlLnB1c2gobmFtZSwgJz0nKVxuICAgICAgICBjb2RlLnB1c2guYXBwbHkoY29kZSwgc2xpY2UoYXJndW1lbnRzKSlcbiAgICAgICAgY29kZS5wdXNoKCc7JylcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG5hbWVcbiAgICB9XG5cbiAgICByZXR1cm4gZXh0ZW5kKHB1c2gsIHtcbiAgICAgIGRlZjogZGVmLFxuICAgICAgdG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAodmFycy5sZW5ndGggPiAwID8gJ3ZhciAnICsgdmFycyArICc7JyA6ICcnKSxcbiAgICAgICAgICBjb2RlLmpvaW4oJycpXG4gICAgICAgIF0uam9pbignJylcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgLy8gcHJvY2VkdXJlIGxpc3RcbiAgdmFyIHByb2NlZHVyZXMgPSB7fVxuICBmdW5jdGlvbiBwcm9jIChuYW1lKSB7XG4gICAgdmFyIGFyZ3MgPSBbXVxuICAgIGZ1bmN0aW9uIGFyZyAoKSB7XG4gICAgICB2YXIgbmFtZSA9ICdhJyArICh2YXJDb3VudGVyKyspXG4gICAgICBhcmdzLnB1c2gobmFtZSlcbiAgICAgIHJldHVybiBuYW1lXG4gICAgfVxuXG4gICAgdmFyIGJvZHkgPSBibG9jaygpXG4gICAgdmFyIGJvZHlUb1N0cmluZyA9IGJvZHkudG9TdHJpbmdcblxuICAgIHZhciByZXN1bHQgPSBwcm9jZWR1cmVzW25hbWVdID0gZXh0ZW5kKGJvZHksIHtcbiAgICAgIGFyZzogYXJnLFxuICAgICAgdG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAnZnVuY3Rpb24oJywgYXJncy5qb2luKCksICcpeycsXG4gICAgICAgICAgYm9keVRvU3RyaW5nKCksXG4gICAgICAgICAgJ30nXG4gICAgICAgIF0uam9pbignJylcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgZnVuY3Rpb24gY29tcGlsZSAoKSB7XG4gICAgdmFyIGNvZGUgPSBbJ1widXNlIHN0cmljdFwiO3JldHVybiB7J11cbiAgICBPYmplY3Qua2V5cyhwcm9jZWR1cmVzKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICBjb2RlLnB1c2goJ1wiJywgbmFtZSwgJ1wiOicsIHByb2NlZHVyZXNbbmFtZV0udG9TdHJpbmcoKSwgJywnKVxuICAgIH0pXG4gICAgY29kZS5wdXNoKCd9JylcbiAgICB2YXIgcHJvYyA9IEZ1bmN0aW9uLmFwcGx5KG51bGwsIGxpbmtlZE5hbWVzLmNvbmNhdChbY29kZS5qb2luKCcnKV0pKVxuICAgIHJldHVybiBwcm9jLmFwcGx5KG51bGwsIGxpbmtlZFZhbHVlcylcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgbGluazogbGluayxcbiAgICBibG9jazogYmxvY2ssXG4gICAgcHJvYzogcHJvYyxcbiAgICBjb21waWxlOiBjb21waWxlXG4gIH1cbn1cbiIsIlxudmFyIGNyZWF0ZUVudmlyb25tZW50ID0gcmVxdWlyZSgnLi9jb2RlZ2VuJylcblxudmFyIHByaW1UeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL3ByaW1pdGl2ZXMuanNvbicpXG52YXIgZ2xUeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL2R0eXBlcy5qc29uJylcblxudmFyIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSID0gMzQ5NjNcblxudmFyIEdMX0ZMT0FUID0gNTEyNlxudmFyIEdMX0ZMT0FUX1ZFQzIgPSAzNTY2NFxudmFyIEdMX0ZMT0FUX1ZFQzMgPSAzNTY2NVxudmFyIEdMX0ZMT0FUX1ZFQzQgPSAzNTY2NlxudmFyIEdMX0lOVCA9IDUxMjRcbnZhciBHTF9JTlRfVkVDMiA9IDM1NjY3XG52YXIgR0xfSU5UX1ZFQzMgPSAzNTY2OFxudmFyIEdMX0lOVF9WRUM0ID0gMzU2NjlcbnZhciBHTF9CT09MID0gMzU2NzBcbnZhciBHTF9CT09MX1ZFQzIgPSAzNTY3MVxudmFyIEdMX0JPT0xfVkVDMyA9IDM1NjcyXG52YXIgR0xfQk9PTF9WRUM0ID0gMzU2NzNcbnZhciBHTF9GTE9BVF9NQVQyID0gMzU2NzRcbnZhciBHTF9GTE9BVF9NQVQzID0gMzU2NzVcbnZhciBHTF9GTE9BVF9NQVQ0ID0gMzU2NzZcbnZhciBHTF9TQU1QTEVSXzJEID0gMzU2NzhcbnZhciBHTF9TQU1QTEVSX0NVQkUgPSAzNTY4MFxuXG52YXIgR0xfVFJJQU5HTEVTID0gNFxuXG52YXIgR0xfQ1VMTF9GQUNFID0gMHgwQjQ0XG52YXIgR0xfQkxFTkQgPSAweDBCRTJcbnZhciBHTF9ESVRIRVIgPSAweDBCRDBcbnZhciBHTF9TVEVOQ0lMX1RFU1QgPSAweDBCOTBcbnZhciBHTF9ERVBUSF9URVNUID0gMHgwQjcxXG52YXIgR0xfU0NJU1NPUl9URVNUID0gMHgwQzExXG52YXIgR0xfUE9MWUdPTl9PRkZTRVRfRklMTCA9IDB4ODAzN1xudmFyIEdMX1NBTVBMRV9BTFBIQV9UT19DT1ZFUkFHRSA9IDB4ODA5RVxudmFyIEdMX1NBTVBMRV9DT1ZFUkFHRSA9IDB4ODBBMFxuXG52YXIgR0xfRlJPTlQgPSAxMDI4XG52YXIgR0xfQkFDSyA9IDEwMjlcblxudmFyIEdMX0NXID0gMHgwOTAwXG52YXIgR0xfQ0NXID0gMHgwOTAxXG5cbnZhciBHTF9NSU5fRVhUID0gMHg4MDA3XG52YXIgR0xfTUFYX0VYVCA9IDB4ODAwOFxuXG52YXIgYmxlbmRGdW5jcyA9IHtcbiAgJzAnOiAwLFxuICAnMSc6IDEsXG4gICd6ZXJvJzogMCxcbiAgJ29uZSc6IDEsXG4gICdzcmMgY29sb3InOiA3NjgsXG4gICdvbmUgbWludXMgc3JjIGNvbG9yJzogNzY5LFxuICAnc3JjIGFscGhhJzogNzcwLFxuICAnb25lIG1pbnVzIHNyYyBhbHBoYSc6IDc3MSxcbiAgJ2RzdCBjb2xvcic6IDc3NCxcbiAgJ29uZSBtaW51cyBkc3QgY29sb3InOiA3NzUsXG4gICdkc3QgYWxwaGEnOiA3NzIsXG4gICdvbmUgbWludXMgZHN0IGFscGhhJzogNzczLFxuICAnY29uc3RhbnQgY29sb3InOiAzMjc2OSxcbiAgJ29uZSBtaW51cyBjb25zdGFudCBjb2xvcic6IDMyNzcwLFxuICAnY29uc3RhbnQgYWxwaGEnOiAzMjc3MSxcbiAgJ29uZSBtaW51cyBjb25zdGFudCBhbHBoYSc6IDMyNzcyLFxuICAnc3JjIGFscGhhIHNhdHVyYXRlJzogNzc2XG59XG5cbnZhciBjb21wYXJlRnVuY3MgPSB7XG4gICduZXZlcic6IDUxMixcbiAgJ2xlc3MnOiA1MTMsXG4gICc8JzogNTEzLFxuICAnZXF1YWwnOiA1MTQsXG4gICc9JzogNTE0LFxuICAnPT0nOiA1MTQsXG4gICc9PT0nOiA1MTQsXG4gICdsZXF1YWwnOiA1MTUsXG4gICc8PSc6IDUxNSxcbiAgJ2dyZWF0ZXInOiA1MTYsXG4gICc+JzogNTE2LFxuICAnbm90ZXF1YWwnOiA1MTcsXG4gICchPSc6IDUxNyxcbiAgJyE9PSc6IDUxNyxcbiAgJ2dlcXVhbCc6IDUxOCxcbiAgJz49JzogNTE4LFxuICAnYWx3YXlzJzogNTE5XG59XG5cbnZhciBzdGVuY2lsT3BzID0ge1xuICAnMCc6IDAsXG4gICd6ZXJvJzogMCxcbiAgJ2tlZXAnOiA3NjgwLFxuICAncmVwbGFjZSc6IDc2ODEsXG4gICdpbmNyZW1lbnQnOiA3NjgyLFxuICAnZGVjcmVtZW50JzogNzY4MyxcbiAgJ2luY3JlbWVudCB3cmFwJzogMzQwNTUsXG4gICdkZWNyZW1lbnQgd3JhcCc6IDM0MDU2LFxuICAnaW52ZXJ0JzogNTM4NlxufVxuXG5mdW5jdGlvbiB0eXBlTGVuZ3RoICh4KSB7XG4gIHN3aXRjaCAoeCkge1xuICAgIGNhc2UgR0xfRkxPQVRfVkVDMjpcbiAgICBjYXNlIEdMX0lOVF9WRUMyOlxuICAgIGNhc2UgR0xfQk9PTF9WRUMyOlxuICAgICAgcmV0dXJuIDJcbiAgICBjYXNlIEdMX0ZMT0FUX1ZFQzM6XG4gICAgY2FzZSBHTF9JTlRfVkVDMzpcbiAgICBjYXNlIEdMX0JPT0xfVkVDMzpcbiAgICAgIHJldHVybiAzXG4gICAgY2FzZSBHTF9GTE9BVF9WRUM0OlxuICAgIGNhc2UgR0xfSU5UX1ZFQzQ6XG4gICAgY2FzZSBHTF9CT09MX1ZFQzQ6XG4gICAgICByZXR1cm4gNFxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gMVxuICB9XG59XG5cbmZ1bmN0aW9uIHNldFVuaWZvcm1TdHJpbmcgKGdsLCB0eXBlLCBsb2NhdGlvbiwgdmFsdWUpIHtcbiAgdmFyIGluZml4XG4gIHZhciBzZXBhcmF0b3IgPSAnLCdcbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSBHTF9GTE9BVDpcbiAgICAgIGluZml4ID0gJzFmJ1xuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX0ZMT0FUX1ZFQzI6XG4gICAgICBpbmZpeCA9ICcyZnYnXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfRkxPQVRfVkVDMzpcbiAgICAgIGluZml4ID0gJzNmdidcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9GTE9BVF9WRUM0OlxuICAgICAgaW5maXggPSAnNGZ2J1xuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX0JPT0w6XG4gICAgY2FzZSBHTF9JTlQ6XG4gICAgICBpbmZpeCA9ICcxaSdcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9CT09MX1ZFQzI6XG4gICAgY2FzZSBHTF9JTlRfVkVDMjpcbiAgICAgIGluZml4ID0gJzJpdidcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9CT09MX1ZFQzM6XG4gICAgY2FzZSBHTF9JTlRfVkVDMzpcbiAgICAgIGluZml4ID0gJzNpdidcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9CT09MX1ZFQzQ6XG4gICAgY2FzZSBHTF9JTlRfVkVDNDpcbiAgICAgIGluZml4ID0gJzRpdidcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9GTE9BVF9NQVQyOlxuICAgICAgaW5maXggPSAnTWF0cml4MmZ2J1xuICAgICAgc2VwYXJhdG9yID0gJyxmYWxzZSwnXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfRkxPQVRfTUFUMzpcbiAgICAgIGluZml4ID0gJ01hdHJpeDNmdidcbiAgICAgIHNlcGFyYXRvciA9ICcsZmFsc2UsJ1xuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX0ZMT0FUX01BVDQ6XG4gICAgICBpbmZpeCA9ICdNYXRyaXg0ZnYnXG4gICAgICBzZXBhcmF0b3IgPSAnLGZhbHNlLCdcbiAgICAgIGJyZWFrXG4gICAgZGVmYXVsdDpcbiAgICAgIFxuICB9XG4gIHJldHVybiBnbCArICcudW5pZm9ybScgKyBpbmZpeCArICcoJyArIGxvY2F0aW9uICsgc2VwYXJhdG9yICsgdmFsdWUgKyAnKTsnXG59XG5cbmZ1bmN0aW9uIHN0YWNrVG9wICh4KSB7XG4gIHJldHVybiB4ICsgJ1snICsgeCArICcubGVuZ3RoLTFdJ1xufVxuXG4vLyBOZWVkIHRvIHByb2Nlc3MgZnJhbWVidWZmZXIgZmlyc3QgaW4gb3B0aW9ucyBsaXN0XG5mdW5jdGlvbiBvcHRpb25Qcmlvcml0eSAoYSwgYikge1xuICBpZiAoYSA9PT0gJ2ZyYW1lYnVmZmVyJykge1xuICAgIHJldHVybiAtMVxuICB9XG4gIGlmIChhIDwgYikge1xuICAgIHJldHVybiAtMVxuICB9IGVsc2UgaWYgKGEgPiBiKSB7XG4gICAgcmV0dXJuIDFcbiAgfVxuICByZXR1cm4gMFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJlZ2xDb21waWxlciAoXG4gIGdsLFxuICBzdHJpbmdTdG9yZSxcbiAgZXh0ZW5zaW9ucyxcbiAgbGltaXRzLFxuICBidWZmZXJTdGF0ZSxcbiAgZWxlbWVudFN0YXRlLFxuICB0ZXh0dXJlU3RhdGUsXG4gIGZyYW1lYnVmZmVyU3RhdGUsXG4gIGdsU3RhdGUsXG4gIHVuaWZvcm1TdGF0ZSxcbiAgYXR0cmlidXRlU3RhdGUsXG4gIHNoYWRlclN0YXRlLFxuICBkcmF3U3RhdGUsXG4gIGZyYW1lU3RhdGUsXG4gIHJlZ2xQb2xsKSB7XG4gIHZhciBjb250ZXh0U3RhdGUgPSBnbFN0YXRlLmNvbnRleHRTdGF0ZVxuXG4gIHZhciBibGVuZEVxdWF0aW9ucyA9IHtcbiAgICAnYWRkJzogMzI3NzQsXG4gICAgJ3N1YnRyYWN0JzogMzI3NzgsXG4gICAgJ3JldmVyc2Ugc3VidHJhY3QnOiAzMjc3OVxuICB9XG4gIGlmIChleHRlbnNpb25zLmV4dF9ibGVuZF9taW5tYXgpIHtcbiAgICBibGVuZEVxdWF0aW9ucy5taW4gPSBHTF9NSU5fRVhUXG4gICAgYmxlbmRFcXVhdGlvbnMubWF4ID0gR0xfTUFYX0VYVFxuICB9XG5cbiAgdmFyIGRyYXdDYWxsQ291bnRlciA9IDBcblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIFNIQURFUiBTSU5HTEUgRFJBVyBPUEVSQVRJT05cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBmdW5jdGlvbiBjb21waWxlU2hhZGVyRHJhdyAocHJvZ3JhbSkge1xuICAgIHZhciBlbnYgPSBjcmVhdGVFbnZpcm9ubWVudCgpXG4gICAgdmFyIGxpbmsgPSBlbnYubGlua1xuICAgIHZhciBkcmF3ID0gZW52LnByb2MoJ2RyYXcnKVxuICAgIHZhciBkZWYgPSBkcmF3LmRlZlxuXG4gICAgdmFyIEdMID0gbGluayhnbClcbiAgICB2YXIgUFJPR1JBTSA9IGxpbmsocHJvZ3JhbS5wcm9ncmFtKVxuICAgIHZhciBCSU5EX0FUVFJJQlVURSA9IGxpbmsoYXR0cmlidXRlU3RhdGUuYmluZClcbiAgICB2YXIgRFJBV19TVEFURSA9IHtcbiAgICAgIGNvdW50OiBsaW5rKGRyYXdTdGF0ZS5jb3VudCksXG4gICAgICBvZmZzZXQ6IGxpbmsoZHJhd1N0YXRlLm9mZnNldCksXG4gICAgICBpbnN0YW5jZXM6IGxpbmsoZHJhd1N0YXRlLmluc3RhbmNlcyksXG4gICAgICBwcmltaXRpdmU6IGxpbmsoZHJhd1N0YXRlLnByaW1pdGl2ZSlcbiAgICB9XG4gICAgdmFyIEVMRU1FTlRfU1RBVEUgPSBsaW5rKGVsZW1lbnRTdGF0ZS5lbGVtZW50cylcbiAgICB2YXIgVEVYVFVSRV9VTklGT1JNUyA9IFtdXG5cbiAgICAvLyBiaW5kIHRoZSBwcm9ncmFtXG4gICAgZHJhdyhHTCwgJy51c2VQcm9ncmFtKCcsIFBST0dSQU0sICcpOycpXG5cbiAgICAvLyBzZXQgdXAgYXR0cmlidXRlIHN0YXRlXG4gICAgcHJvZ3JhbS5hdHRyaWJ1dGVzLmZvckVhY2goZnVuY3Rpb24gKGF0dHJpYnV0ZSkge1xuICAgICAgdmFyIFNUQUNLID0gbGluayhhdHRyaWJ1dGVTdGF0ZS5kZWYoYXR0cmlidXRlLm5hbWUpKVxuICAgICAgZHJhdyhCSU5EX0FUVFJJQlVURSwgJygnLFxuICAgICAgICBhdHRyaWJ1dGUubG9jYXRpb24sICcsJyxcbiAgICAgICAgbGluayhhdHRyaWJ1dGVTdGF0ZS5iaW5kaW5nc1thdHRyaWJ1dGUubG9jYXRpb25dKSwgJywnLFxuICAgICAgICBTVEFDSywgJy5yZWNvcmRzWycsIFNUQUNLLCAnLnRvcF0nLCAnLCcsXG4gICAgICAgIHR5cGVMZW5ndGgoYXR0cmlidXRlLmluZm8udHlwZSksICcpOycpXG4gICAgfSlcblxuICAgIC8vIHNldCB1cCB1bmlmb3Jtc1xuICAgIHByb2dyYW0udW5pZm9ybXMuZm9yRWFjaChmdW5jdGlvbiAodW5pZm9ybSkge1xuICAgICAgdmFyIExPQ0FUSU9OID0gbGluayh1bmlmb3JtLmxvY2F0aW9uKVxuICAgICAgdmFyIFNUQUNLID0gbGluayh1bmlmb3JtU3RhdGUuZGVmKHVuaWZvcm0ubmFtZSkpXG4gICAgICB2YXIgVE9QID0gU1RBQ0sgKyAnWycgKyBTVEFDSyArICcubGVuZ3RoLTFdJ1xuICAgICAgdmFyIHR5cGUgPSB1bmlmb3JtLmluZm8udHlwZVxuICAgICAgaWYgKHR5cGUgPT09IEdMX1NBTVBMRVJfMkQgfHwgdHlwZSA9PT0gR0xfU0FNUExFUl9DVUJFKSB7XG4gICAgICAgIHZhciBURVhfVkFMVUUgPSBkZWYoVE9QICsgJy5fdGV4dHVyZScpXG4gICAgICAgIFRFWFRVUkVfVU5JRk9STVMucHVzaChURVhfVkFMVUUpXG4gICAgICAgIGRyYXcoc2V0VW5pZm9ybVN0cmluZyhHTCwgR0xfSU5ULCBMT0NBVElPTiwgVEVYX1ZBTFVFICsgJy5iaW5kKCknKSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRyYXcoc2V0VW5pZm9ybVN0cmluZyhHTCwgdHlwZSwgTE9DQVRJT04sIFRPUCkpXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIHVuYmluZCB0ZXh0dXJlcyBpbW1lZGlhdGVseVxuICAgIFRFWFRVUkVfVU5JRk9STVMuZm9yRWFjaChmdW5jdGlvbiAoVEVYX1ZBTFVFKSB7XG4gICAgICBkcmF3KFRFWF9WQUxVRSwgJy51bmJpbmQoKTsnKVxuICAgIH0pXG5cbiAgICAvLyBFeGVjdXRlIGRyYXcgY29tbWFuZFxuICAgIHZhciBDVVJfUFJJTUlUSVZFID0gZGVmKHN0YWNrVG9wKERSQVdfU1RBVEUucHJpbWl0aXZlKSlcbiAgICB2YXIgQ1VSX0NPVU5UID0gZGVmKHN0YWNrVG9wKERSQVdfU1RBVEUuY291bnQpKVxuICAgIHZhciBDVVJfT0ZGU0VUID0gZGVmKHN0YWNrVG9wKERSQVdfU1RBVEUub2Zmc2V0KSlcbiAgICB2YXIgQ1VSX0VMRU1FTlRTID0gZGVmKHN0YWNrVG9wKEVMRU1FTlRfU1RBVEUpKVxuXG4gICAgLy8gT25seSBleGVjdXRlIGRyYXcgY29tbWFuZCBpZiBudW1iZXIgZWxlbWVudHMgaXMgPiAwXG4gICAgZHJhdygnaWYoJywgQ1VSX0NPVU5ULCAnKXsnKVxuXG4gICAgdmFyIGluc3RhbmNpbmcgPSBleHRlbnNpb25zLmFuZ2xlX2luc3RhbmNlZF9hcnJheXNcbiAgICBpZiAoaW5zdGFuY2luZykge1xuICAgICAgdmFyIENVUl9JTlNUQU5DRVMgPSBkZWYoc3RhY2tUb3AoRFJBV19TVEFURS5pbnN0YW5jZXMpKVxuICAgICAgdmFyIElOU1RBTkNFX0VYVCA9IGxpbmsoaW5zdGFuY2luZylcbiAgICAgIGRyYXcoXG4gICAgICAgICdpZignLCBDVVJfRUxFTUVOVFMsICcpeycsXG4gICAgICAgIENVUl9FTEVNRU5UUywgJy5iaW5kKCk7JyxcbiAgICAgICAgJ2lmKCcsIENVUl9JTlNUQU5DRVMsICc+MCl7JyxcbiAgICAgICAgSU5TVEFOQ0VfRVhULCAnLmRyYXdFbGVtZW50c0luc3RhbmNlZEFOR0xFKCcsXG4gICAgICAgIENVUl9QUklNSVRJVkUsICcsJyxcbiAgICAgICAgQ1VSX0NPVU5ULCAnLCcsXG4gICAgICAgIENVUl9FTEVNRU5UUywgJy50eXBlLCcsXG4gICAgICAgIENVUl9PRkZTRVQsICcsJyxcbiAgICAgICAgQ1VSX0lOU1RBTkNFUywgJyk7fWVsc2V7JyxcbiAgICAgICAgR0wsICcuZHJhd0VsZW1lbnRzKCcsXG4gICAgICAgIENVUl9QUklNSVRJVkUsICcsJyxcbiAgICAgICAgQ1VSX0NPVU5ULCAnLCcsXG4gICAgICAgIENVUl9FTEVNRU5UUywgJy50eXBlLCcsXG4gICAgICAgIENVUl9PRkZTRVQsICcpO30nLFxuICAgICAgICAnfWVsc2UgaWYoJywgQ1VSX0lOU1RBTkNFUywgJz4wKXsnLFxuICAgICAgICBJTlNUQU5DRV9FWFQsICcuZHJhd0FycmF5c0luc3RhbmNlZEFOR0xFKCcsXG4gICAgICAgIENVUl9QUklNSVRJVkUsICcsJyxcbiAgICAgICAgQ1VSX09GRlNFVCwgJywnLFxuICAgICAgICBDVVJfQ09VTlQsICcsJyxcbiAgICAgICAgQ1VSX0lOU1RBTkNFUywgJyk7fWVsc2V7JyxcbiAgICAgICAgR0wsICcuZHJhd0FycmF5cygnLFxuICAgICAgICBDVVJfUFJJTUlUSVZFLCAnLCcsXG4gICAgICAgIENVUl9PRkZTRVQsICcsJyxcbiAgICAgICAgQ1VSX0NPVU5ULCAnKTt9fScpXG4gICAgfSBlbHNlIHtcbiAgICAgIGRyYXcoXG4gICAgICAgICdpZignLCBDVVJfRUxFTUVOVFMsICcpeycsXG4gICAgICAgIEdMLCAnLmRyYXdFbGVtZW50cygnLFxuICAgICAgICBDVVJfUFJJTUlUSVZFLCAnLCcsXG4gICAgICAgIENVUl9DT1VOVCwgJywnLFxuICAgICAgICBDVVJfRUxFTUVOVFMsICcudHlwZSwnLFxuICAgICAgICBDVVJfT0ZGU0VULCAnKTt9JyxcbiAgICAgICAgJ31lbHNleycsXG4gICAgICAgIEdMLCAnLmRyYXdBcnJheXMoJyxcbiAgICAgICAgQ1VSX1BSSU1JVElWRSwgJywnLFxuICAgICAgICBDVVJfT0ZGU0VULCAnLCcsXG4gICAgICAgIENVUl9DT1VOVCwgJyk7fScpXG4gICAgfVxuXG4gICAgcmV0dXJuIGVudi5jb21waWxlKCkuZHJhd1xuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBCQVRDSCBEUkFXIE9QRVJBVElPTlxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGNvbXBpbGVCYXRjaCAoXG4gICAgcHJvZ3JhbSwgb3B0aW9ucywgdW5pZm9ybXMsIGF0dHJpYnV0ZXMsIHN0YXRpY09wdGlvbnMpIHtcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gY29kZSBnZW5lcmF0aW9uIGhlbHBlcnNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgdmFyIGVudiA9IGNyZWF0ZUVudmlyb25tZW50KClcbiAgICB2YXIgbGluayA9IGVudi5saW5rXG4gICAgdmFyIGJhdGNoID0gZW52LnByb2MoJ2JhdGNoJylcbiAgICB2YXIgZXhpdCA9IGVudi5ibG9jaygpXG4gICAgdmFyIGRlZiA9IGJhdGNoLmRlZlxuICAgIHZhciBhcmcgPSBiYXRjaC5hcmdcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyByZWdsIHN0YXRlXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBHTCA9IGxpbmsoZ2wpXG4gICAgdmFyIFBST0dSQU0gPSBsaW5rKHByb2dyYW0ucHJvZ3JhbSlcbiAgICB2YXIgQklORF9BVFRSSUJVVEUgPSBsaW5rKGF0dHJpYnV0ZVN0YXRlLmJpbmQpXG4gICAgdmFyIEZSQU1FX1NUQVRFID0gbGluayhmcmFtZVN0YXRlKVxuICAgIHZhciBGUkFNRUJVRkZFUl9TVEFURSA9IGxpbmsoZnJhbWVidWZmZXJTdGF0ZSlcbiAgICB2YXIgRFJBV19TVEFURSA9IHtcbiAgICAgIGNvdW50OiBsaW5rKGRyYXdTdGF0ZS5jb3VudCksXG4gICAgICBvZmZzZXQ6IGxpbmsoZHJhd1N0YXRlLm9mZnNldCksXG4gICAgICBpbnN0YW5jZXM6IGxpbmsoZHJhd1N0YXRlLmluc3RhbmNlcyksXG4gICAgICBwcmltaXRpdmU6IGxpbmsoZHJhd1N0YXRlLnByaW1pdGl2ZSlcbiAgICB9XG4gICAgdmFyIENPTlRFWFRfU1RBVEUgPSB7fVxuICAgIHZhciBFTEVNRU5UUyA9IGxpbmsoZWxlbWVudFN0YXRlLmVsZW1lbnRzKVxuICAgIHZhciBDVVJfQ09VTlQgPSBkZWYoc3RhY2tUb3AoRFJBV19TVEFURS5jb3VudCkpXG4gICAgdmFyIENVUl9PRkZTRVQgPSBkZWYoc3RhY2tUb3AoRFJBV19TVEFURS5vZmZzZXQpKVxuICAgIHZhciBDVVJfUFJJTUlUSVZFID0gZGVmKHN0YWNrVG9wKERSQVdfU1RBVEUucHJpbWl0aXZlKSlcbiAgICB2YXIgQ1VSX0VMRU1FTlRTID0gZGVmKHN0YWNrVG9wKEVMRU1FTlRTKSlcbiAgICB2YXIgQ1VSX0lOU1RBTkNFU1xuICAgIHZhciBJTlNUQU5DRV9FWFRcbiAgICB2YXIgaW5zdGFuY2luZyA9IGV4dGVuc2lvbnMuYW5nbGVfaW5zdGFuY2VkX2FycmF5c1xuICAgIGlmIChpbnN0YW5jaW5nKSB7XG4gICAgICBDVVJfSU5TVEFOQ0VTID0gZGVmKHN0YWNrVG9wKERSQVdfU1RBVEUuaW5zdGFuY2VzKSlcbiAgICAgIElOU1RBTkNFX0VYVCA9IGxpbmsoaW5zdGFuY2luZylcbiAgICB9XG4gICAgdmFyIGhhc0R5bmFtaWNFbGVtZW50cyA9ICdlbGVtZW50cycgaW4gb3B0aW9uc1xuXG4gICAgZnVuY3Rpb24gbGlua0NvbnRleHQgKHgpIHtcbiAgICAgIHZhciByZXN1bHQgPSBDT05URVhUX1NUQVRFW3hdXG4gICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH1cbiAgICAgIHJlc3VsdCA9IENPTlRFWFRfU1RBVEVbeF0gPSBsaW5rKGNvbnRleHRTdGF0ZVt4XSlcbiAgICAgIHJldHVybiByZXN1bHRcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gYmF0Y2gvYXJndW1lbnQgdmFyc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgTlVNX0FSR1MgPSBhcmcoKVxuICAgIHZhciBBUkdTID0gYXJnKClcbiAgICB2YXIgQVJHID0gZGVmKClcbiAgICB2YXIgQkFUQ0hfSUQgPSBkZWYoKVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGxvYWQgYSBkeW5hbWljIHZhcmlhYmxlXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBkeW5hbWljVmFycyA9IHt9XG4gICAgZnVuY3Rpb24gZHluICh4KSB7XG4gICAgICB2YXIgaWQgPSB4LmlkXG4gICAgICB2YXIgcmVzdWx0ID0gZHluYW1pY1ZhcnNbaWRdXG4gICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH1cbiAgICAgIGlmICh4LmZ1bmMpIHtcbiAgICAgICAgcmVzdWx0ID0gYmF0Y2guZGVmKFxuICAgICAgICAgIGxpbmsoeC5kYXRhKSwgJygnLCBBUkcsICcsJywgQkFUQ0hfSUQsICcsJywgRlJBTUVfU1RBVEUsICcpJylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc3VsdCA9IGJhdGNoLmRlZihBUkcsICcuJywgeC5kYXRhKVxuICAgICAgfVxuICAgICAgZHluYW1pY1ZhcnNbaWRdID0gcmVzdWx0XG4gICAgICByZXR1cm4gcmVzdWx0XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHJldHJpZXZlcyB0aGUgZmlyc3QgbmFtZS1tYXRjaGluZyByZWNvcmQgZnJvbSBhbiBBY3RpdmVJbmZvIGxpc3RcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgZnVuY3Rpb24gZmluZEluZm8gKGxpc3QsIG5hbWUpIHtcbiAgICAgIHJldHVybiBsaXN0LmZpbmQoZnVuY3Rpb24gKGl0ZW0pIHtcbiAgICAgICAgcmV0dXJuIGl0ZW0ubmFtZSA9PT0gbmFtZVxuICAgICAgfSlcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gYmluZCBzaGFkZXJcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgYmF0Y2goR0wsICcudXNlUHJvZ3JhbSgnLCBQUk9HUkFNLCAnKTsnKVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHNldCBzdGF0aWMgdW5pZm9ybXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgcHJvZ3JhbS51bmlmb3Jtcy5mb3JFYWNoKGZ1bmN0aW9uICh1bmlmb3JtKSB7XG4gICAgICBpZiAodW5pZm9ybS5uYW1lIGluIHVuaWZvcm1zKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgdmFyIExPQ0FUSU9OID0gbGluayh1bmlmb3JtLmxvY2F0aW9uKVxuICAgICAgdmFyIFNUQUNLID0gbGluayh1bmlmb3JtU3RhdGUuZGVmKHVuaWZvcm0ubmFtZSkpXG4gICAgICB2YXIgVE9QID0gU1RBQ0sgKyAnWycgKyBTVEFDSyArICcubGVuZ3RoLTFdJ1xuICAgICAgdmFyIHR5cGUgPSB1bmlmb3JtLmluZm8udHlwZVxuICAgICAgaWYgKHR5cGUgPT09IEdMX1NBTVBMRVJfMkQgfHwgdHlwZSA9PT0gR0xfU0FNUExFUl9DVUJFKSB7XG4gICAgICAgIHZhciBURVhfVkFMVUUgPSBkZWYoVE9QICsgJy5fdGV4dHVyZScpXG4gICAgICAgIGJhdGNoKHNldFVuaWZvcm1TdHJpbmcoR0wsIEdMX0lOVCwgTE9DQVRJT04sIFRFWF9WQUxVRSArICcuYmluZCgpJykpXG4gICAgICAgIGV4aXQoVEVYX1ZBTFVFLCAnLnVuYmluZCgpOycpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBiYXRjaChzZXRVbmlmb3JtU3RyaW5nKEdMLCB0eXBlLCBMT0NBVElPTiwgVE9QKSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHNldCBzdGF0aWMgYXR0cmlidXRlc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBwcm9ncmFtLmF0dHJpYnV0ZXMuZm9yRWFjaChmdW5jdGlvbiAoYXR0cmlidXRlKSB7XG4gICAgICBpZiAoYXR0cmlidXRlcy5uYW1lIGluIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICB2YXIgU1RBQ0sgPSBsaW5rKGF0dHJpYnV0ZVN0YXRlLmRlZihhdHRyaWJ1dGUubmFtZSkpXG4gICAgICBiYXRjaChCSU5EX0FUVFJJQlVURSwgJygnLFxuICAgICAgICBhdHRyaWJ1dGUubG9jYXRpb24sICcsJyxcbiAgICAgICAgbGluayhhdHRyaWJ1dGVTdGF0ZS5iaW5kaW5nc1thdHRyaWJ1dGUubG9jYXRpb25dKSwgJywnLFxuICAgICAgICBTVEFDSywgJy5yZWNvcmRzWycsIFNUQUNLLCAnLnRvcF0nLCAnLCcsXG4gICAgICAgIHR5cGVMZW5ndGgoYXR0cmlidXRlLmluZm8udHlwZSksICcpOycpXG4gICAgfSlcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBzZXQgc3RhdGljIGVsZW1lbnQgYnVmZmVyXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIGlmICghaGFzRHluYW1pY0VsZW1lbnRzKSB7XG4gICAgICBiYXRjaChcbiAgICAgICAgJ2lmKCcsIENVUl9FTEVNRU5UUywgJyl7JyxcbiAgICAgICAgR0wsICcuYmluZEJ1ZmZlcignLCBHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUiwgJywnLCBDVVJfRUxFTUVOVFMsICcuYnVmZmVyLmJ1ZmZlcik7JyxcbiAgICAgICAgJ31lbHNleycsXG4gICAgICAgIEdMLCAnLmJpbmRCdWZmZXIoJywgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIsICcsbnVsbCk7JyxcbiAgICAgICAgJ30nKVxuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBsb29wIG92ZXIgYWxsIGFyZ3VtZW50c1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBiYXRjaChcbiAgICAgICdmb3IoJywgQkFUQ0hfSUQsICc9MDsnLCBCQVRDSF9JRCwgJzwnLCBOVU1fQVJHUywgJzsrKycsIEJBVENIX0lELCAnKXsnLFxuICAgICAgQVJHLCAnPScsIEFSR1MsICdbJywgQkFUQ0hfSUQsICddOycpXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gc2V0IGR5bmFtaWMgZmxhZ3NcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgT2JqZWN0LmtleXMob3B0aW9ucykuc29ydChvcHRpb25Qcmlvcml0eSkuZm9yRWFjaChmdW5jdGlvbiAob3B0aW9uKSB7XG4gICAgICB2YXIgVkFMVUUgPSBkeW4ob3B0aW9uc1tvcHRpb25dKVxuXG4gICAgICBmdW5jdGlvbiBzZXRDYXAgKGZsYWcpIHtcbiAgICAgICAgYmF0Y2goXG4gICAgICAgICAgJ2lmKCcsIFZBTFVFLCAnKXsnLFxuICAgICAgICAgIEdMLCAnLmVuYWJsZSgnLCBmbGFnLCAnKTt9ZWxzZXsnLFxuICAgICAgICAgIEdMLCAnLmRpc2FibGUoJywgZmxhZywgJyk7fScpXG4gICAgICB9XG5cbiAgICAgIHN3aXRjaCAob3B0aW9uKSB7XG4gICAgICAgIGNhc2UgJ2ZyYW1lYnVmZmVyJzpcbiAgICAgICAgICB2YXIgVklFV1BPUlRfU1RBVEUgPSBsaW5rQ29udGV4dCgndmlld3BvcnQnKVxuICAgICAgICAgIHZhciBTQ0lTU09SX1NUQVRFID0gbGlua0NvbnRleHQoJ3NjaXNzb3IuYm94JylcbiAgICAgICAgICBiYXRjaChcbiAgICAgICAgICAgICdpZignLCBGUkFNRUJVRkZFUl9TVEFURSwgJy5wdXNoKCcsXG4gICAgICAgICAgICBWQUxVRSwgJyYmJywgVkFMVUUsICcuX2ZyYW1lYnVmZmVyKSl7JyxcbiAgICAgICAgICAgIEZSQU1FQlVGRkVSX1NUQVRFLCAnLnBvbGwoKTsnLFxuICAgICAgICAgICAgVklFV1BPUlRfU1RBVEUsICcuc2V0RGlydHkoKTsnLFxuICAgICAgICAgICAgU0NJU1NPUl9TVEFURSwgJy5zZXREaXJ0eSgpOycsXG4gICAgICAgICAgICAnfScpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICAvLyBDYXBzXG4gICAgICAgIGNhc2UgJ2N1bGwuZW5hYmxlJzpcbiAgICAgICAgICBzZXRDYXAoR0xfQ1VMTF9GQUNFKVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ2JsZW5kLmVuYWJsZSc6XG4gICAgICAgICAgc2V0Q2FwKEdMX0JMRU5EKVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ2RpdGhlcic6XG4gICAgICAgICAgc2V0Q2FwKEdMX0RJVEhFUilcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlICdzdGVuY2lsLmVuYWJsZSc6XG4gICAgICAgICAgc2V0Q2FwKEdMX1NURU5DSUxfVEVTVClcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlICdkZXB0aC5lbmFibGUnOlxuICAgICAgICAgIHNldENhcChHTF9ERVBUSF9URVNUKVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ3NjaXNzb3IuZW5hYmxlJzpcbiAgICAgICAgICBzZXRDYXAoR0xfU0NJU1NPUl9URVNUKVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ3BvbHlnb25PZmZzZXQuZW5hYmxlJzpcbiAgICAgICAgICBzZXRDYXAoR0xfUE9MWUdPTl9PRkZTRVRfRklMTClcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlICdzYW1wbGUuYWxwaGEnOlxuICAgICAgICAgIHNldENhcChHTF9TQU1QTEVfQUxQSEFfVE9fQ09WRVJBR0UpXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSAnc2FtcGxlLmVuYWJsZSc6XG4gICAgICAgICAgc2V0Q2FwKEdMX1NBTVBMRV9DT1ZFUkFHRSlcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2RlcHRoLm1hc2snOlxuICAgICAgICAgIGJhdGNoKEdMLCAnLmRlcHRoTWFzaygnLCBWQUxVRSwgJyk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2RlcHRoLmZ1bmMnOlxuICAgICAgICAgIHZhciBERVBUSF9GVU5DUyA9IGxpbmsoY29tcGFyZUZ1bmNzKVxuICAgICAgICAgIGJhdGNoKEdMLCAnLmRlcHRoRnVuYygnLCBERVBUSF9GVU5DUywgJ1snLCBWQUxVRSwgJ10pOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdkZXB0aC5yYW5nZSc6XG4gICAgICAgICAgYmF0Y2goR0wsICcuZGVwdGhSYW5nZSgnLCBWQUxVRSwgJ1swXSwnLCBWQUxVRSwgJ1sxXSk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2JsZW5kLmNvbG9yJzpcbiAgICAgICAgICBiYXRjaChHTCwgJy5ibGVuZENvbG9yKCcsXG4gICAgICAgICAgICBWQUxVRSwgJ1swXSwnLFxuICAgICAgICAgICAgVkFMVUUsICdbMV0sJyxcbiAgICAgICAgICAgIFZBTFVFLCAnWzJdLCcsXG4gICAgICAgICAgICBWQUxVRSwgJ1szXSk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2JsZW5kLmVxdWF0aW9uJzpcbiAgICAgICAgICB2YXIgQkxFTkRfRVFVQVRJT05TID0gbGluayhibGVuZEVxdWF0aW9ucylcbiAgICAgICAgICBiYXRjaChcbiAgICAgICAgICAgICdpZih0eXBlb2YgJywgVkFMVUUsICc9PT1cInN0cmluZ1wiKXsnLFxuICAgICAgICAgICAgR0wsICcuYmxlbmRFcXVhdGlvbignLCBCTEVORF9FUVVBVElPTlMsICdbJywgVkFMVUUsICddKTsnLFxuICAgICAgICAgICAgJ31lbHNleycsXG4gICAgICAgICAgICBHTCwgJy5ibGVuZEVxdWF0aW9uU2VwYXJhdGUoJyxcbiAgICAgICAgICAgIEJMRU5EX0VRVUFUSU9OUywgJ1snLCBWQUxVRSwgJy5yZ2JdLCcsXG4gICAgICAgICAgICBCTEVORF9FUVVBVElPTlMsICdbJywgVkFMVUUsICcuYWxwaGFdKTsnLFxuICAgICAgICAgICAgJ30nKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnYmxlbmQuZnVuYyc6XG4gICAgICAgICAgdmFyIEJMRU5EX0ZVTkNTID0gbGluayhibGVuZEZ1bmNzKVxuICAgICAgICAgIGJhdGNoKFxuICAgICAgICAgICAgR0wsICcuYmxlbmRGdW5jU2VwYXJhdGUoJyxcbiAgICAgICAgICAgIEJMRU5EX0ZVTkNTLFxuICAgICAgICAgICAgJ1tcInNyY1JHQlwiIGluICcsIFZBTFVFLCAnPycsIFZBTFVFLCAnLnNyY1JHQjonLCBWQUxVRSwgJy5zcmNdLCcsXG4gICAgICAgICAgICBCTEVORF9GVU5DUyxcbiAgICAgICAgICAgICdbXCJkc3RSR0JcIiBpbiAnLCBWQUxVRSwgJz8nLCBWQUxVRSwgJy5kc3RSR0I6JywgVkFMVUUsICcuZHN0XSwnLFxuICAgICAgICAgICAgQkxFTkRfRlVOQ1MsXG4gICAgICAgICAgICAnW1wic3JjQWxwaGFcIiBpbiAnLCBWQUxVRSwgJz8nLCBWQUxVRSwgJy5zcmNBbHBoYTonLCBWQUxVRSwgJy5zcmNdLCcsXG4gICAgICAgICAgICBCTEVORF9GVU5DUyxcbiAgICAgICAgICAgICdbXCJkc3RBbHBoYVwiIGluICcsIFZBTFVFLCAnPycsIFZBTFVFLCAnLmRzdEFscGhhOicsIFZBTFVFLCAnLmRzdF0pOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdzdGVuY2lsLm1hc2snOlxuICAgICAgICAgIGJhdGNoKEdMLCAnLnN0ZW5jaWxNYXNrKCcsIFZBTFVFLCAnKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnc3RlbmNpbC5mdW5jJzpcbiAgICAgICAgICB2YXIgU1RFTkNJTF9GVU5DUyA9IGxpbmsoY29tcGFyZUZ1bmNzKVxuICAgICAgICAgIGJhdGNoKEdMLCAnLnN0ZW5jaWxGdW5jKCcsXG4gICAgICAgICAgICBTVEVOQ0lMX0ZVTkNTLCAnWycsIFZBTFVFLCAnLmNtcHx8XCJhbHdheXNcIl0sJyxcbiAgICAgICAgICAgIFZBTFVFLCAnLnJlZnwwLCcsXG4gICAgICAgICAgICAnXCJtYXNrXCIgaW4gJywgVkFMVUUsICc/JywgVkFMVUUsICcubWFzazotMSk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwub3BGcm9udCc6XG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwub3BCYWNrJzpcbiAgICAgICAgICB2YXIgU1RFTkNJTF9PUFMgPSBsaW5rKHN0ZW5jaWxPcHMpXG4gICAgICAgICAgYmF0Y2goR0wsICcuc3RlbmNpbE9wU2VwYXJhdGUoJyxcbiAgICAgICAgICAgIG9wdGlvbiA9PT0gJ3N0ZW5jaWwub3BGcm9udCcgPyBHTF9GUk9OVCA6IEdMX0JBQ0ssICcsJyxcbiAgICAgICAgICAgIFNURU5DSUxfT1BTLCAnWycsIFZBTFVFLCAnLmZhaWx8fFwia2VlcFwiXSwnLFxuICAgICAgICAgICAgU1RFTkNJTF9PUFMsICdbJywgVkFMVUUsICcuemZhaWx8fFwia2VlcFwiXSwnLFxuICAgICAgICAgICAgU1RFTkNJTF9PUFMsICdbJywgVkFMVUUsICcucGFzc3x8XCJrZWVwXCJdKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAncG9seWdvbk9mZnNldC5vZmZzZXQnOlxuICAgICAgICAgIGJhdGNoKEdMLCAnLnBvbHlnb25PZmZzZXQoJyxcbiAgICAgICAgICAgIFZBTFVFLCAnLmZhY3Rvcnx8MCwnLFxuICAgICAgICAgICAgVkFMVUUsICcudW5pdHN8fDApOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdjdWxsLmZhY2UnOlxuICAgICAgICAgIGJhdGNoKEdMLCAnLmN1bGxGYWNlKCcsXG4gICAgICAgICAgICBWQUxVRSwgJz09PVwiZnJvbnRcIj8nLCBHTF9GUk9OVCwgJzonLCBHTF9CQUNLLCAnKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnbGluZVdpZHRoJzpcbiAgICAgICAgICBiYXRjaChHTCwgJy5saW5lV2lkdGgoJywgVkFMVUUsICcpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdmcm9udEZhY2UnOlxuICAgICAgICAgIGJhdGNoKEdMLCAnLmZyb250RmFjZSgnLFxuICAgICAgICAgICAgVkFMVUUsICc9PT1cImN3XCI/JywgR0xfQ1csICc6JywgR0xfQ0NXLCAnKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnY29sb3JNYXNrJzpcbiAgICAgICAgICBiYXRjaChHTCwgJy5jb2xvck1hc2soJyxcbiAgICAgICAgICAgIFZBTFVFLCAnWzBdLCcsXG4gICAgICAgICAgICBWQUxVRSwgJ1sxXSwnLFxuICAgICAgICAgICAgVkFMVUUsICdbMl0sJyxcbiAgICAgICAgICAgIFZBTFVFLCAnWzNdKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnc2FtcGxlLmNvdmVyYWdlJzpcbiAgICAgICAgICBiYXRjaChHTCwgJy5zYW1wbGVDb3ZlcmFnZSgnLFxuICAgICAgICAgICAgVkFMVUUsICcudmFsdWUsJyxcbiAgICAgICAgICAgIFZBTFVFLCAnLmludmVydCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3NjaXNzb3IuYm94JzpcbiAgICAgICAgY2FzZSAndmlld3BvcnQnOlxuICAgICAgICAgIHZhciBCT1hfU1RBVEUgPSBsaW5rQ29udGV4dChvcHRpb24pXG4gICAgICAgICAgYmF0Y2goQk9YX1NUQVRFLCAnLnB1c2goJyxcbiAgICAgICAgICAgIFZBTFVFLCAnLnh8fDAsJyxcbiAgICAgICAgICAgIFZBTFVFLCAnLnl8fDAsJyxcbiAgICAgICAgICAgIFZBTFVFLCAnLnd8fC0xLCcsXG4gICAgICAgICAgICBWQUxVRSwgJy5ofHwtMSk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3ByaW1pdGl2ZXMnOlxuICAgICAgICBjYXNlICdvZmZzZXQnOlxuICAgICAgICBjYXNlICdjb3VudCc6XG4gICAgICAgIGNhc2UgJ2VsZW1lbnRzJzpcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIHVwZGF0ZSB2aWV3cG9ydC9zY2lzc29yIGJveCBzdGF0ZSBhbmQgcmVzdG9yZSBmcmFtZWJ1ZmZlclxuICAgIGlmICgndmlld3BvcnQnIGluIG9wdGlvbnMgfHwgJ2ZyYW1lYnVmZmVyJyBpbiBvcHRpb25zKSB7XG4gICAgICBiYXRjaChsaW5rQ29udGV4dCgndmlld3BvcnQnKSwgJy5wb2xsKCk7JylcbiAgICB9XG4gICAgaWYgKCdzY2lzc29yLmJveCcgaW4gb3B0aW9ucyB8fCAnZnJhbWVidWZmZXInIGluIG9wdGlvbnMpIHtcbiAgICAgIGJhdGNoKGxpbmtDb250ZXh0KCdzY2lzc29yLmJveCcpLCAnLnBvbGwoKTsnKVxuICAgIH1cbiAgICBpZiAoJ2ZyYW1lYnVmZmVyJyBpbiBvcHRpb25zKSB7XG4gICAgICBiYXRjaChGUkFNRUJVRkZFUl9TVEFURSwgJy5wb3AoKTsnKVxuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBzZXQgZHluYW1pYyB1bmlmb3Jtc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgcHJvZ3JhbVVuaWZvcm1zID0gcHJvZ3JhbS51bmlmb3Jtc1xuICAgIHZhciBEWU5BTUlDX1RFWFRVUkVTID0gW11cbiAgICBPYmplY3Qua2V5cyh1bmlmb3JtcykuZm9yRWFjaChmdW5jdGlvbiAodW5pZm9ybSkge1xuICAgICAgdmFyIGRhdGEgPSBmaW5kSW5mbyhwcm9ncmFtVW5pZm9ybXMsIHVuaWZvcm0pXG4gICAgICBpZiAoIWRhdGEpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICB2YXIgVFlQRSA9IGRhdGEuaW5mby50eXBlXG4gICAgICB2YXIgTE9DQVRJT04gPSBsaW5rKGRhdGEubG9jYXRpb24pXG4gICAgICB2YXIgVkFMVUUgPSBkeW4odW5pZm9ybXNbdW5pZm9ybV0pXG4gICAgICBpZiAoZGF0YS5pbmZvLnR5cGUgPT09IEdMX1NBTVBMRVJfMkQgfHxcbiAgICAgICAgICBkYXRhLmluZm8udHlwZSA9PT0gR0xfU0FNUExFUl9DVUJFKSB7XG4gICAgICAgIHZhciBURVhfVkFMVUUgPSBkZWYoVkFMVUUgKyAnLl90ZXh0dXJlJylcbiAgICAgICAgRFlOQU1JQ19URVhUVVJFUy5wdXNoKFRFWF9WQUxVRSlcbiAgICAgICAgYmF0Y2goc2V0VW5pZm9ybVN0cmluZyhHTCwgR0xfSU5ULCBMT0NBVElPTiwgVEVYX1ZBTFVFICsgJy5iaW5kKCknKSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGJhdGNoKHNldFVuaWZvcm1TdHJpbmcoR0wsIFRZUEUsIExPQ0FUSU9OLCBWQUxVRSkpXG4gICAgICB9XG4gICAgfSlcbiAgICBEWU5BTUlDX1RFWFRVUkVTLmZvckVhY2goZnVuY3Rpb24gKFZBTFVFKSB7XG4gICAgICBiYXRjaChWQUxVRSwgJy51bmJpbmQoKTsnKVxuICAgIH0pXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gc2V0IGR5bmFtaWMgYXR0cmlidXRlc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgcHJvZ3JhbUF0dHJpYnV0ZXMgPSBwcm9ncmFtLmF0dHJpYnV0ZXNcbiAgICBPYmplY3Qua2V5cyhhdHRyaWJ1dGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChhdHRyaWJ1dGUpIHtcbiAgICAgIHZhciBkYXRhID0gZmluZEluZm8ocHJvZ3JhbUF0dHJpYnV0ZXMsIGF0dHJpYnV0ZSlcbiAgICAgIGlmICghZGF0YSkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIGJhdGNoKEJJTkRfQVRUUklCVVRFLCAnKCcsXG4gICAgICAgIGRhdGEubG9jYXRpb24sICcsJyxcbiAgICAgICAgbGluayhhdHRyaWJ1dGUuYmluZGluZ3NbZGF0YS5sb2NhdGlvbl0pLCAnLCcsXG4gICAgICAgIGR5bihhdHRyaWJ1dGVzW2F0dHJpYnV0ZV0pLCAnLCcsXG4gICAgICAgIHR5cGVMZW5ndGgoZGF0YS5pbmZvLnR5cGUpLCAnKTsnKVxuICAgIH0pXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gc2V0IGR5bmFtaWMgYXR0cmlidXRlc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAgIGlmIChvcHRpb25zLmNvdW50KSB7XG4gICAgICBiYXRjaChDVVJfQ09VTlQsICc9JywgZHluKG9wdGlvbnMuY291bnQpLCAnOycpXG4gICAgfSBlbHNlIGlmICghdXNlRWxlbWVudE9wdGlvbignY291bnQnKSkge1xuICAgICAgYmF0Y2goJ2lmKCcsIENVUl9DT1VOVCwgJyl7JylcbiAgICB9XG4gICAgaWYgKG9wdGlvbnMub2Zmc2V0KSB7XG4gICAgICBiYXRjaChDVVJfT0ZGU0VULCAnPScsIGR5bihvcHRpb25zLm9mZnNldCksICc7JylcbiAgICB9XG4gICAgaWYgKG9wdGlvbnMucHJpbWl0aXZlKSB7XG4gICAgICB2YXIgUFJJTV9UWVBFUyA9IGxpbmsocHJpbVR5cGVzKVxuICAgICAgYmF0Y2goQ1VSX1BSSU1JVElWRSwgJz0nLCBQUklNX1RZUEVTLCAnWycsIGR5bihvcHRpb25zLnByaW1pdGl2ZSksICddOycpXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdXNlRWxlbWVudE9wdGlvbiAoeCkge1xuICAgICAgcmV0dXJuIGhhc0R5bmFtaWNFbGVtZW50cyAmJiAhKHggaW4gb3B0aW9ucyB8fCB4IGluIHN0YXRpY09wdGlvbnMpXG4gICAgfVxuICAgIGlmIChoYXNEeW5hbWljRWxlbWVudHMpIHtcbiAgICAgIHZhciBkeW5FbGVtZW50cyA9IGR5bihvcHRpb25zLmVsZW1lbnRzKVxuICAgICAgYmF0Y2goQ1VSX0VMRU1FTlRTLCAnPScsXG4gICAgICAgIGR5bkVsZW1lbnRzLCAnPycsIGR5bkVsZW1lbnRzLCAnLl9lbGVtZW50czpudWxsOycpXG4gICAgfVxuICAgIGlmICh1c2VFbGVtZW50T3B0aW9uKCdvZmZzZXQnKSkge1xuICAgICAgYmF0Y2goQ1VSX09GRlNFVCwgJz0wOycpXG4gICAgfVxuXG4gICAgLy8gRW1pdCBkcmF3IGNvbW1hbmRcbiAgICBiYXRjaCgnaWYoJywgQ1VSX0VMRU1FTlRTLCAnKXsnKVxuICAgIGlmICh1c2VFbGVtZW50T3B0aW9uKCdjb3VudCcpKSB7XG4gICAgICBiYXRjaChDVVJfQ09VTlQsICc9JywgQ1VSX0VMRU1FTlRTLCAnLnZlcnRDb3VudDsnLFxuICAgICAgICAnaWYoJywgQ1VSX0NPVU5ULCAnPjApeycpXG4gICAgfVxuICAgIGlmICh1c2VFbGVtZW50T3B0aW9uKCdwcmltaXRpdmUnKSkge1xuICAgICAgYmF0Y2goQ1VSX1BSSU1JVElWRSwgJz0nLCBDVVJfRUxFTUVOVFMsICcucHJpbVR5cGU7JylcbiAgICB9XG4gICAgaWYgKGhhc0R5bmFtaWNFbGVtZW50cykge1xuICAgICAgYmF0Y2goXG4gICAgICAgIEdMLFxuICAgICAgICAnLmJpbmRCdWZmZXIoJyxcbiAgICAgICAgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIsICcsJyxcbiAgICAgICAgQ1VSX0VMRU1FTlRTLCAnLmJ1ZmZlci5idWZmZXIpOycpXG4gICAgfVxuICAgIGlmIChpbnN0YW5jaW5nKSB7XG4gICAgICBpZiAob3B0aW9ucy5pbnN0YW5jZXMpIHtcbiAgICAgICAgYmF0Y2goQ1VSX0lOU1RBTkNFUywgJz0nLCBkeW4ob3B0aW9ucy5pbnN0YW5jZXMpLCAnOycpXG4gICAgICB9XG4gICAgICBiYXRjaChcbiAgICAgICAgJ2lmKCcsIENVUl9JTlNUQU5DRVMsICc+MCl7JyxcbiAgICAgICAgSU5TVEFOQ0VfRVhULCAnLmRyYXdFbGVtZW50c0luc3RhbmNlZEFOR0xFKCcsXG4gICAgICAgIENVUl9QUklNSVRJVkUsICcsJyxcbiAgICAgICAgQ1VSX0NPVU5ULCAnLCcsXG4gICAgICAgIENVUl9FTEVNRU5UUywgJy50eXBlLCcsXG4gICAgICAgIENVUl9PRkZTRVQsICcsJyxcbiAgICAgICAgQ1VSX0lOU1RBTkNFUywgJyk7fWVsc2V7JylcbiAgICB9XG4gICAgYmF0Y2goXG4gICAgICBHTCwgJy5kcmF3RWxlbWVudHMoJyxcbiAgICAgIENVUl9QUklNSVRJVkUsICcsJyxcbiAgICAgIENVUl9DT1VOVCwgJywnLFxuICAgICAgQ1VSX0VMRU1FTlRTLCAnLnR5cGUsJyxcbiAgICAgIENVUl9PRkZTRVQsICcpOycpXG4gICAgaWYgKGluc3RhbmNpbmcpIHtcbiAgICAgIGJhdGNoKCd9JylcbiAgICB9XG4gICAgaWYgKHVzZUVsZW1lbnRPcHRpb24oJ2NvdW50JykpIHtcbiAgICAgIGJhdGNoKCd9JylcbiAgICB9XG4gICAgYmF0Y2goJ31lbHNleycpXG4gICAgaWYgKCF1c2VFbGVtZW50T3B0aW9uKCdjb3VudCcpKSB7XG4gICAgICBpZiAodXNlRWxlbWVudE9wdGlvbigncHJpbWl0aXZlJykpIHtcbiAgICAgICAgYmF0Y2goQ1VSX1BSSU1JVElWRSwgJz0nLCBHTF9UUklBTkdMRVMsICc7JylcbiAgICAgIH1cbiAgICAgIGlmIChpbnN0YW5jaW5nKSB7XG4gICAgICAgIGJhdGNoKFxuICAgICAgICAgICdpZignLCBDVVJfSU5TVEFOQ0VTLCAnPjApeycsXG4gICAgICAgICAgSU5TVEFOQ0VfRVhULCAnLmRyYXdBcnJheXNJbnN0YW5jZWRBTkdMRSgnLFxuICAgICAgICAgIENVUl9QUklNSVRJVkUsICcsJyxcbiAgICAgICAgICBDVVJfT0ZGU0VULCAnLCcsXG4gICAgICAgICAgQ1VSX0NPVU5ULCAnLCcsXG4gICAgICAgICAgQ1VSX0lOU1RBTkNFUywgJyk7fWVsc2V7JylcbiAgICAgIH1cbiAgICAgIGJhdGNoKFxuICAgICAgICBHTCwgJy5kcmF3QXJyYXlzKCcsXG4gICAgICAgIENVUl9QUklNSVRJVkUsICcsJyxcbiAgICAgICAgQ1VSX09GRlNFVCwgJywnLFxuICAgICAgICBDVVJfQ09VTlQsICcpO30nKVxuICAgICAgaWYgKGluc3RhbmNpbmcpIHtcbiAgICAgICAgYmF0Y2goJ30nKVxuICAgICAgfVxuICAgIH1cbiAgICBiYXRjaCgnfX0nLCBleGl0KVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGNvbXBpbGUgYW5kIHJldHVyblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICByZXR1cm4gZW52LmNvbXBpbGUoKS5iYXRjaFxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBNQUlOIERSQVcgQ09NTUFORFxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGNvbXBpbGVDb21tYW5kIChcbiAgICBzdGF0aWNPcHRpb25zLCBzdGF0aWNVbmlmb3Jtcywgc3RhdGljQXR0cmlidXRlcyxcbiAgICBkeW5hbWljT3B0aW9ucywgZHluYW1pY1VuaWZvcm1zLCBkeW5hbWljQXR0cmlidXRlcyxcbiAgICBoYXNEeW5hbWljKSB7XG4gICAgLy8gQ3JlYXRlIGNvZGUgZ2VuZXJhdGlvbiBlbnZpcm9ubWVudFxuICAgIHZhciBlbnYgPSBjcmVhdGVFbnZpcm9ubWVudCgpXG4gICAgdmFyIGxpbmsgPSBlbnYubGlua1xuICAgIHZhciBibG9jayA9IGVudi5ibG9ja1xuICAgIHZhciBwcm9jID0gZW52LnByb2NcblxuICAgIHZhciBjYWxsSWQgPSBkcmF3Q2FsbENvdW50ZXIrK1xuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIENvbW1vbiBzdGF0ZSB2YXJpYWJsZXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgdmFyIEdMX1BPTEwgPSBsaW5rKHJlZ2xQb2xsKVxuICAgIHZhciBTVFJJTkdfU1RPUkUgPSBsaW5rKHN0cmluZ1N0b3JlKVxuICAgIHZhciBGUkFHX1NIQURFUl9TVEFURSA9IGxpbmsoc2hhZGVyU3RhdGUuZnJhZ1NoYWRlcnMpXG4gICAgdmFyIFZFUlRfU0hBREVSX1NUQVRFID0gbGluayhzaGFkZXJTdGF0ZS52ZXJ0U2hhZGVycylcbiAgICB2YXIgUFJPR1JBTV9TVEFURSA9IGxpbmsoc2hhZGVyU3RhdGUucHJvZ3JhbXMpXG4gICAgdmFyIEZSQU1FQlVGRkVSX1NUQVRFID0gbGluayhmcmFtZWJ1ZmZlclN0YXRlKVxuICAgIHZhciBEUkFXX1NUQVRFID0ge1xuICAgICAgY291bnQ6IGxpbmsoZHJhd1N0YXRlLmNvdW50KSxcbiAgICAgIG9mZnNldDogbGluayhkcmF3U3RhdGUub2Zmc2V0KSxcbiAgICAgIGluc3RhbmNlczogbGluayhkcmF3U3RhdGUuaW5zdGFuY2VzKSxcbiAgICAgIHByaW1pdGl2ZTogbGluayhkcmF3U3RhdGUucHJpbWl0aXZlKVxuICAgIH1cbiAgICB2YXIgRUxFTUVOVF9TVEFURSA9IGxpbmsoZWxlbWVudFN0YXRlLmVsZW1lbnRzKVxuICAgIHZhciBQUklNX1RZUEVTID0gbGluayhwcmltVHlwZXMpXG4gICAgdmFyIENPTVBBUkVfRlVOQ1MgPSBsaW5rKGNvbXBhcmVGdW5jcylcbiAgICB2YXIgU1RFTkNJTF9PUFMgPSBsaW5rKHN0ZW5jaWxPcHMpXG5cbiAgICB2YXIgQ09OVEVYVF9TVEFURSA9IHt9XG4gICAgZnVuY3Rpb24gbGlua0NvbnRleHQgKHgpIHtcbiAgICAgIHZhciByZXN1bHQgPSBDT05URVhUX1NUQVRFW3hdXG4gICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH1cbiAgICAgIHJlc3VsdCA9IENPTlRFWFRfU1RBVEVbeF0gPSBsaW5rKGNvbnRleHRTdGF0ZVt4XSlcbiAgICAgIHJldHVybiByZXN1bHRcbiAgICB9XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gU1RBVElDIFNUQVRFXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIENvZGUgYmxvY2tzIGZvciB0aGUgc3RhdGljIHNlY3Rpb25zXG4gICAgdmFyIGVudHJ5ID0gYmxvY2soKVxuICAgIHZhciBleGl0ID0gYmxvY2soKVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHVwZGF0ZSBkZWZhdWx0IGNvbnRleHQgc3RhdGUgdmFyaWFibGVzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIGZ1bmN0aW9uIGhhbmRsZVN0YXRpY09wdGlvbiAocGFyYW0sIHZhbHVlKSB7XG4gICAgICB2YXIgU1RBVEVfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgIGVudHJ5KFNUQVRFX1NUQUNLLCAnLnB1c2goJywgdmFsdWUsICcpOycpXG4gICAgICBleGl0KFNUQVRFX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgfVxuXG4gICAgdmFyIGhhc1NoYWRlciA9IGZhbHNlXG4gICAgT2JqZWN0LmtleXMoc3RhdGljT3B0aW9ucykuc29ydChvcHRpb25Qcmlvcml0eSkuZm9yRWFjaChmdW5jdGlvbiAocGFyYW0pIHtcbiAgICAgIHZhciB2YWx1ZSA9IHN0YXRpY09wdGlvbnNbcGFyYW1dXG4gICAgICBzd2l0Y2ggKHBhcmFtKSB7XG4gICAgICAgIGNhc2UgJ2ZyYWcnOlxuICAgICAgICAgIGhhc1NoYWRlciA9IHRydWVcbiAgICAgICAgICBlbnRyeShGUkFHX1NIQURFUl9TVEFURSwgJy5wdXNoKCcsIGxpbmsoc3RyaW5nU3RvcmUuaWQodmFsdWUpKSwgJyk7JylcbiAgICAgICAgICBleGl0KEZSQUdfU0hBREVSX1NUQVRFLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICd2ZXJ0JzpcbiAgICAgICAgICBoYXNTaGFkZXIgPSB0cnVlXG4gICAgICAgICAgZW50cnkoVkVSVF9TSEFERVJfU1RBVEUsICcucHVzaCgnLCBsaW5rKHN0cmluZ1N0b3JlLmlkKHZhbHVlKSksICcpOycpXG4gICAgICAgICAgZXhpdChWRVJUX1NIQURFUl9TVEFURSwgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnZnJhbWVidWZmZXInOlxuICAgICAgICAgIHZhciBmYm8gPSBmcmFtZWJ1ZmZlclN0YXRlLmdldEZyYW1lYnVmZmVyKHZhbHVlKVxuICAgICAgICAgIFxuICAgICAgICAgIHZhciBWSUVXUE9SVF9TVEFURSA9IGxpbmtDb250ZXh0KCd2aWV3cG9ydCcpXG4gICAgICAgICAgdmFyIFNDSVNTT1JfU1RBVEUgPSBsaW5rQ29udGV4dCgnc2Npc3Nvci5ib3gnKVxuICAgICAgICAgIGVudHJ5KCdpZignLCBGUkFNRUJVRkZFUl9TVEFURSwgJy5wdXNoKCcsIGxpbmsoXG4gICAgICAgICAgICB2YWx1ZSAmJiB2YWx1ZS5fZnJhbWVidWZmZXIpLCAnKSl7JyxcbiAgICAgICAgICAgIFZJRVdQT1JUX1NUQVRFLCAnLnNldERpcnR5KCk7JyxcbiAgICAgICAgICAgIFNDSVNTT1JfU1RBVEUsICcuc2V0RGlydHkoKTsnLFxuICAgICAgICAgICAgJ30nKVxuICAgICAgICAgIGV4aXQoJ2lmKCcsIEZSQU1FQlVGRkVSX1NUQVRFLCAnLnBvcCgpKXsnLFxuICAgICAgICAgICAgVklFV1BPUlRfU1RBVEUsICcuc2V0RGlydHkoKTsnLFxuICAgICAgICAgICAgU0NJU1NPUl9TVEFURSwgJy5zZXREaXJ0eSgpOycsXG4gICAgICAgICAgICAnfScpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICAvLyBVcGRhdGUgZHJhdyBzdGF0ZVxuICAgICAgICBjYXNlICdjb3VudCc6XG4gICAgICAgIGNhc2UgJ29mZnNldCc6XG4gICAgICAgIGNhc2UgJ2luc3RhbmNlcyc6XG4gICAgICAgICAgXG4gICAgICAgICAgZW50cnkoRFJBV19TVEFURVtwYXJhbV0sICcucHVzaCgnLCB2YWx1ZSwgJyk7JylcbiAgICAgICAgICBleGl0KERSQVdfU1RBVEVbcGFyYW1dLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICAvLyBVcGRhdGUgcHJpbWl0aXZlIHR5cGVcbiAgICAgICAgY2FzZSAncHJpbWl0aXZlJzpcbiAgICAgICAgICBcbiAgICAgICAgICB2YXIgcHJpbVR5cGUgPSBwcmltVHlwZXNbdmFsdWVdXG4gICAgICAgICAgZW50cnkoRFJBV19TVEFURS5wcmltaXRpdmUsICcucHVzaCgnLCBwcmltVHlwZSwgJyk7JylcbiAgICAgICAgICBleGl0KERSQVdfU1RBVEUucHJpbWl0aXZlLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICAvLyBVcGRhdGUgZWxlbWVudCBidWZmZXJcbiAgICAgICAgY2FzZSAnZWxlbWVudHMnOlxuICAgICAgICAgIHZhciBlbGVtZW50cyA9IGVsZW1lbnRTdGF0ZS5nZXRFbGVtZW50cyh2YWx1ZSlcbiAgICAgICAgICB2YXIgaGFzUHJpbWl0aXZlID0gISgncHJpbWl0aXZlJyBpbiBzdGF0aWNPcHRpb25zKVxuICAgICAgICAgIHZhciBoYXNDb3VudCA9ICEoJ2NvdW50JyBpbiBzdGF0aWNPcHRpb25zKVxuICAgICAgICAgIGlmIChlbGVtZW50cykge1xuICAgICAgICAgICAgdmFyIEVMRU1FTlRTID0gbGluayhlbGVtZW50cylcbiAgICAgICAgICAgIGVudHJ5KEVMRU1FTlRfU1RBVEUsICcucHVzaCgnLCBFTEVNRU5UUywgJyk7JylcbiAgICAgICAgICAgIGlmIChoYXNQcmltaXRpdmUpIHtcbiAgICAgICAgICAgICAgZW50cnkoRFJBV19TVEFURS5wcmltaXRpdmUsICcucHVzaCgnLCBFTEVNRU5UUywgJy5wcmltVHlwZSk7JylcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChoYXNDb3VudCkge1xuICAgICAgICAgICAgICBlbnRyeShEUkFXX1NUQVRFLmNvdW50LCAnLnB1c2goJywgRUxFTUVOVFMsICcudmVydENvdW50KTsnKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBlbnRyeShFTEVNRU5UX1NUQVRFLCAnLnB1c2gobnVsbCk7JylcbiAgICAgICAgICAgIGlmIChoYXNQcmltaXRpdmUpIHtcbiAgICAgICAgICAgICAgZW50cnkoRFJBV19TVEFURS5wcmltaXRpdmUsICcucHVzaCgnLCBHTF9UUklBTkdMRVMsICcpOycpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaGFzQ291bnQpIHtcbiAgICAgICAgICAgICAgZW50cnkoRFJBV19TVEFURS5jb3VudCwgJy5wdXNoKDApOycpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChoYXNQcmltaXRpdmUpIHtcbiAgICAgICAgICAgIGV4aXQoRFJBV19TVEFURS5wcmltaXRpdmUsICcucG9wKCk7JylcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGhhc0NvdW50KSB7XG4gICAgICAgICAgICBleGl0KERSQVdfU1RBVEUuY291bnQsICcucG9wKCk7JylcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCEoJ29mZnNldCcgaW4gc3RhdGljT3B0aW9ucykpIHtcbiAgICAgICAgICAgIGVudHJ5KERSQVdfU1RBVEUub2Zmc2V0LCAnLnB1c2goMCk7JylcbiAgICAgICAgICAgIGV4aXQoRFJBV19TVEFURS5vZmZzZXQsICcucG9wKCk7JylcbiAgICAgICAgICB9XG4gICAgICAgICAgZXhpdChFTEVNRU5UX1NUQVRFLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdjdWxsLmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ2JsZW5kLmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ2RpdGhlcic6XG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwuZW5hYmxlJzpcbiAgICAgICAgY2FzZSAnZGVwdGguZW5hYmxlJzpcbiAgICAgICAgY2FzZSAnc2Npc3Nvci5lbmFibGUnOlxuICAgICAgICBjYXNlICdwb2x5Z29uT2Zmc2V0LmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ3NhbXBsZS5hbHBoYSc6XG4gICAgICAgIGNhc2UgJ3NhbXBsZS5lbmFibGUnOlxuICAgICAgICBjYXNlICdkZXB0aC5tYXNrJzpcbiAgICAgICAgICBcbiAgICAgICAgICBoYW5kbGVTdGF0aWNPcHRpb24ocGFyYW0sIHZhbHVlKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnZGVwdGguZnVuYyc6XG4gICAgICAgICAgXG4gICAgICAgICAgaGFuZGxlU3RhdGljT3B0aW9uKHBhcmFtLCBjb21wYXJlRnVuY3NbdmFsdWVdKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnZGVwdGgucmFuZ2UnOlxuICAgICAgICAgIFxuICAgICAgICAgIHZhciBERVBUSF9SQU5HRV9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGVudHJ5KERFUFRIX1JBTkdFX1NUQUNLLCAnLnB1c2goJywgdmFsdWVbMF0sICcsJywgdmFsdWVbMV0sICcpOycpXG4gICAgICAgICAgZXhpdChERVBUSF9SQU5HRV9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnYmxlbmQuZnVuYyc6XG4gICAgICAgICAgdmFyIEJMRU5EX0ZVTkNfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBcbiAgICAgICAgICB2YXIgc3JjUkdCID0gKCdzcmNSR0InIGluIHZhbHVlID8gdmFsdWUuc3JjUkdCIDogdmFsdWUuc3JjKVxuICAgICAgICAgIHZhciBzcmNBbHBoYSA9ICgnc3JjQWxwaGEnIGluIHZhbHVlID8gdmFsdWUuc3JjQWxwaGEgOiB2YWx1ZS5zcmMpXG4gICAgICAgICAgdmFyIGRzdFJHQiA9ICgnZHN0UkdCJyBpbiB2YWx1ZSA/IHZhbHVlLmRzdFJHQiA6IHZhbHVlLmRzdClcbiAgICAgICAgICB2YXIgZHN0QWxwaGEgPSAoJ2RzdEFscGhhJyBpbiB2YWx1ZSA/IHZhbHVlLmRzdEFscGhhIDogdmFsdWUuZHN0KVxuICAgICAgICAgIFxuICAgICAgICAgIFxuICAgICAgICAgIFxuICAgICAgICAgIFxuICAgICAgICAgIGVudHJ5KEJMRU5EX0ZVTkNfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgYmxlbmRGdW5jc1tzcmNSR0JdLCAnLCcsXG4gICAgICAgICAgICBibGVuZEZ1bmNzW2RzdFJHQl0sICcsJyxcbiAgICAgICAgICAgIGJsZW5kRnVuY3Nbc3JjQWxwaGFdLCAnLCcsXG4gICAgICAgICAgICBibGVuZEZ1bmNzW2RzdEFscGhhXSwgJyk7JylcbiAgICAgICAgICBleGl0KEJMRU5EX0ZVTkNfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2JsZW5kLmVxdWF0aW9uJzpcbiAgICAgICAgICB2YXIgQkxFTkRfRVFVQVRJT05fU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBlbnRyeShCTEVORF9FUVVBVElPTl9TVEFDSyxcbiAgICAgICAgICAgICAgJy5wdXNoKCcsXG4gICAgICAgICAgICAgIGJsZW5kRXF1YXRpb25zW3ZhbHVlXSwgJywnLFxuICAgICAgICAgICAgICBibGVuZEVxdWF0aW9uc1t2YWx1ZV0sICcpOycpXG4gICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZW50cnkoQkxFTkRfRVFVQVRJT05fU1RBQ0ssXG4gICAgICAgICAgICAgICcucHVzaCgnLFxuICAgICAgICAgICAgICBibGVuZEVxdWF0aW9uc1t2YWx1ZS5yZ2JdLCAnLCcsXG4gICAgICAgICAgICAgIGJsZW5kRXF1YXRpb25zW3ZhbHVlLmFscGhhXSwgJyk7JylcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgXG4gICAgICAgICAgfVxuICAgICAgICAgIGV4aXQoQkxFTkRfRVFVQVRJT05fU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2JsZW5kLmNvbG9yJzpcbiAgICAgICAgICBcbiAgICAgICAgICB2YXIgQkxFTkRfQ09MT1JfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBlbnRyeShCTEVORF9DT0xPUl9TVEFDSyxcbiAgICAgICAgICAgICcucHVzaCgnLFxuICAgICAgICAgICAgdmFsdWVbMF0sICcsJyxcbiAgICAgICAgICAgIHZhbHVlWzFdLCAnLCcsXG4gICAgICAgICAgICB2YWx1ZVsyXSwgJywnLFxuICAgICAgICAgICAgdmFsdWVbM10sICcpOycpXG4gICAgICAgICAgZXhpdChCTEVORF9DT0xPUl9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnc3RlbmNpbC5tYXNrJzpcbiAgICAgICAgICBcbiAgICAgICAgICB2YXIgU1RFTkNJTF9NQVNLX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZW50cnkoU1RFTkNJTF9NQVNLX1NUQUNLLCAnLnB1c2goJywgdmFsdWUsICcpOycpXG4gICAgICAgICAgZXhpdChTVEVOQ0lMX01BU0tfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwuZnVuYyc6XG4gICAgICAgICAgXG4gICAgICAgICAgdmFyIGNtcCA9IHZhbHVlLmNtcCB8fCAna2VlcCdcbiAgICAgICAgICB2YXIgcmVmID0gdmFsdWUucmVmIHx8IDBcbiAgICAgICAgICB2YXIgbWFzayA9ICdtYXNrJyBpbiB2YWx1ZSA/IHZhbHVlLm1hc2sgOiAtMVxuICAgICAgICAgIFxuICAgICAgICAgIFxuICAgICAgICAgIFxuICAgICAgICAgIHZhciBTVEVOQ0lMX0ZVTkNfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBlbnRyeShTVEVOQ0lMX0ZVTkNfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgY29tcGFyZUZ1bmNzW2NtcF0sICcsJyxcbiAgICAgICAgICAgIHJlZiwgJywnLFxuICAgICAgICAgICAgbWFzaywgJyk7JylcbiAgICAgICAgICBleGl0KFNURU5DSUxfRlVOQ19TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnc3RlbmNpbC5vcEZyb250JzpcbiAgICAgICAgY2FzZSAnc3RlbmNpbC5vcEJhY2snOlxuICAgICAgICAgIFxuICAgICAgICAgIHZhciBmYWlsID0gdmFsdWUuZmFpbCB8fCAna2VlcCdcbiAgICAgICAgICB2YXIgemZhaWwgPSB2YWx1ZS56ZmFpbCB8fCAna2VlcCdcbiAgICAgICAgICB2YXIgcGFzcyA9IHZhbHVlLnBhc3MgfHwgJ2tlZXAnXG4gICAgICAgICAgXG4gICAgICAgICAgXG4gICAgICAgICAgXG4gICAgICAgICAgdmFyIFNURU5DSUxfT1BfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBlbnRyeShTVEVOQ0lMX09QX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIHN0ZW5jaWxPcHNbZmFpbF0sICcsJyxcbiAgICAgICAgICAgIHN0ZW5jaWxPcHNbemZhaWxdLCAnLCcsXG4gICAgICAgICAgICBzdGVuY2lsT3BzW3Bhc3NdLCAnKTsnKVxuICAgICAgICAgIGV4aXQoU1RFTkNJTF9PUF9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAncG9seWdvbk9mZnNldC5vZmZzZXQnOlxuICAgICAgICAgIFxuICAgICAgICAgIHZhciBmYWN0b3IgPSB2YWx1ZS5mYWN0b3IgfHwgMFxuICAgICAgICAgIHZhciB1bml0cyA9IHZhbHVlLnVuaXRzIHx8IDBcbiAgICAgICAgICBcbiAgICAgICAgICBcbiAgICAgICAgICB2YXIgUE9MWUdPTl9PRkZTRVRfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBlbnRyeShQT0xZR09OX09GRlNFVF9TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICBmYWN0b3IsICcsJywgdW5pdHMsICcpOycpXG4gICAgICAgICAgZXhpdChQT0xZR09OX09GRlNFVF9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnY3VsbC5mYWNlJzpcbiAgICAgICAgICB2YXIgZmFjZSA9IDBcbiAgICAgICAgICBpZiAodmFsdWUgPT09ICdmcm9udCcpIHtcbiAgICAgICAgICAgIGZhY2UgPSBHTF9GUk9OVFxuICAgICAgICAgIH0gZWxzZSBpZiAodmFsdWUgPT09ICdiYWNrJykge1xuICAgICAgICAgICAgZmFjZSA9IEdMX0JBQ0tcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgdmFyIENVTExfRkFDRV9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGVudHJ5KENVTExfRkFDRV9TVEFDSywgJy5wdXNoKCcsIGZhY2UsICcpOycpXG4gICAgICAgICAgZXhpdChDVUxMX0ZBQ0VfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2xpbmVXaWR0aCc6XG4gICAgICAgICAgdmFyIGxpbmVXaWR0aERpbXMgPSBsaW1pdHMubGluZVdpZHRoRGltc1xuICAgICAgICAgIFxuICAgICAgICAgIGhhbmRsZVN0YXRpY09wdGlvbihwYXJhbSwgdmFsdWUpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdmcm9udEZhY2UnOlxuICAgICAgICAgIHZhciBvcmllbnRhdGlvbiA9IDBcbiAgICAgICAgICBpZiAodmFsdWUgPT09ICdjdycpIHtcbiAgICAgICAgICAgIG9yaWVudGF0aW9uID0gR0xfQ1dcbiAgICAgICAgICB9IGVsc2UgaWYgKHZhbHVlID09PSAnY2N3Jykge1xuICAgICAgICAgICAgb3JpZW50YXRpb24gPSBHTF9DQ1dcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgdmFyIEZST05UX0ZBQ0VfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBlbnRyeShGUk9OVF9GQUNFX1NUQUNLLCAnLnB1c2goJywgb3JpZW50YXRpb24sICcpOycpXG4gICAgICAgICAgZXhpdChGUk9OVF9GQUNFX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdjb2xvck1hc2snOlxuICAgICAgICAgIFxuICAgICAgICAgIHZhciBDT0xPUl9NQVNLX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZW50cnkoQ09MT1JfTUFTS19TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICB2YWx1ZS5tYXAoZnVuY3Rpb24gKHYpIHsgcmV0dXJuICEhdiB9KS5qb2luKCksXG4gICAgICAgICAgICAnKTsnKVxuICAgICAgICAgIGV4aXQoQ09MT1JfTUFTS19TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnc2FtcGxlLmNvdmVyYWdlJzpcbiAgICAgICAgICBcbiAgICAgICAgICB2YXIgc2FtcGxlVmFsdWUgPSAndmFsdWUnIGluIHZhbHVlID8gdmFsdWUudmFsdWUgOiAxXG4gICAgICAgICAgdmFyIHNhbXBsZUludmVydCA9ICEhdmFsdWUuaW52ZXJ0XG4gICAgICAgICAgXG4gICAgICAgICAgdmFyIFNBTVBMRV9DT1ZFUkFHRV9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGVudHJ5KFNBTVBMRV9DT1ZFUkFHRV9TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICBzYW1wbGVWYWx1ZSwgJywnLCBzYW1wbGVJbnZlcnQsICcpOycpXG4gICAgICAgICAgZXhpdChTQU1QTEVfQ09WRVJBR0VfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3ZpZXdwb3J0JzpcbiAgICAgICAgY2FzZSAnc2Npc3Nvci5ib3gnOlxuICAgICAgICAgIFxuICAgICAgICAgIHZhciBYID0gdmFsdWUueCB8fCAwXG4gICAgICAgICAgdmFyIFkgPSB2YWx1ZS55IHx8IDBcbiAgICAgICAgICB2YXIgVyA9IC0xXG4gICAgICAgICAgdmFyIEggPSAtMVxuICAgICAgICAgIFxuICAgICAgICAgIFxuICAgICAgICAgIGlmICgndycgaW4gdmFsdWUpIHtcbiAgICAgICAgICAgIFcgPSB2YWx1ZS53XG4gICAgICAgICAgICBcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCdoJyBpbiB2YWx1ZSkge1xuICAgICAgICAgICAgSCA9IHZhbHVlLmhcbiAgICAgICAgICAgIFxuICAgICAgICAgIH1cbiAgICAgICAgICB2YXIgQk9YX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZW50cnkoQk9YX1NUQUNLLCAnLnB1c2goJywgWCwgJywnLCBZLCAnLCcsIFcsICcsJywgSCwgJyk7JylcbiAgICAgICAgICBleGl0KEJPWF9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAvLyBUT0RPIFNob3VsZCB0aGlzIGp1c3QgYmUgYSB3YXJuaW5nIGluc3RlYWQ/XG4gICAgICAgICAgXG4gICAgICAgICAgYnJlYWtcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHVwZGF0ZSBzaGFkZXIgcHJvZ3JhbVxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBpZiAoaGFzU2hhZGVyKSB7XG4gICAgICBpZiAoc3RhdGljT3B0aW9ucy5mcmFnICYmIHN0YXRpY09wdGlvbnMudmVydCkge1xuICAgICAgICB2YXIgZnJhZ1NyYyA9IHN0YXRpY09wdGlvbnMuZnJhZ1xuICAgICAgICB2YXIgdmVydFNyYyA9IHN0YXRpY09wdGlvbnMudmVydFxuICAgICAgICBlbnRyeShQUk9HUkFNX1NUQVRFLCAnLnB1c2goJyxcbiAgICAgICAgICBsaW5rKHNoYWRlclN0YXRlLmNyZWF0ZShcbiAgICAgICAgICAgIHN0cmluZ1N0b3JlLmlkKHZlcnRTcmMpLFxuICAgICAgICAgICAgc3RyaW5nU3RvcmUuaWQoZnJhZ1NyYykpKSwgJyk7JylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBGUkFHX1NSQyA9IGVudHJ5LmRlZihcbiAgICAgICAgICBGUkFHX1NIQURFUl9TVEFURSwgJ1snLCBGUkFHX1NIQURFUl9TVEFURSwgJy5sZW5ndGgtMV0nKVxuICAgICAgICB2YXIgVkVSVF9TUkMgPSBlbnRyeS5kZWYoXG4gICAgICAgICAgVkVSVF9TSEFERVJfU1RBVEUsICdbJywgVkVSVF9TSEFERVJfU1RBVEUsICcubGVuZ3RoLTFdJylcbiAgICAgICAgdmFyIExJTktfUFJPRyA9IGxpbmsoc2hhZGVyU3RhdGUuY3JlYXRlKVxuICAgICAgICBlbnRyeShcbiAgICAgICAgICBQUk9HUkFNX1NUQVRFLCAnLnB1c2goJyxcbiAgICAgICAgICBMSU5LX1BST0csICcoJywgVkVSVF9TUkMsICcsJywgRlJBR19TUkMsICcpKTsnKVxuICAgICAgfVxuICAgICAgZXhpdChQUk9HUkFNX1NUQVRFLCAnLnBvcCgpOycpXG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHVwZGF0ZSBzdGF0aWMgdW5pZm9ybXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgT2JqZWN0LmtleXMoc3RhdGljVW5pZm9ybXMpLmZvckVhY2goZnVuY3Rpb24gKHVuaWZvcm0pIHtcbiAgICAgIHZhciBTVEFDSyA9IGxpbmsodW5pZm9ybVN0YXRlLmRlZih1bmlmb3JtKSlcbiAgICAgIHZhciBWQUxVRVxuICAgICAgdmFyIHZhbHVlID0gc3RhdGljVW5pZm9ybXNbdW5pZm9ybV1cbiAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbicgJiYgdmFsdWUuX3JlZ2xUeXBlKSB7XG4gICAgICAgIFZBTFVFID0gbGluayh2YWx1ZSlcbiAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICAgICAgVkFMVUUgPSBsaW5rKHZhbHVlLnNsaWNlKCkpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBWQUxVRSA9ICt2YWx1ZVxuICAgICAgfVxuICAgICAgZW50cnkoU1RBQ0ssICcucHVzaCgnLCBWQUxVRSwgJyk7JylcbiAgICAgIGV4aXQoU1RBQ0ssICcucG9wKCk7JylcbiAgICB9KVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHVwZGF0ZSBkZWZhdWx0IGF0dHJpYnV0ZXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgT2JqZWN0LmtleXMoc3RhdGljQXR0cmlidXRlcykuZm9yRWFjaChmdW5jdGlvbiAoYXR0cmlidXRlKSB7XG4gICAgICB2YXIgQVRUUklCVVRFID0gbGluayhhdHRyaWJ1dGVTdGF0ZS5kZWYoYXR0cmlidXRlKSlcblxuICAgICAgdmFyIGRhdGEgPSBzdGF0aWNBdHRyaWJ1dGVzW2F0dHJpYnV0ZV1cbiAgICAgIGlmICh0eXBlb2YgZGF0YSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgZW50cnkoQVRUUklCVVRFLCAnLnB1c2hWZWMoJywgK2RhdGEsICcsMCwwLDApOycpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcblxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShkYXRhKSkge1xuICAgICAgICAgIGVudHJ5KFxuICAgICAgICAgICAgQVRUUklCVVRFLCAnLnB1c2hWZWMoJyxcbiAgICAgICAgICAgIFtkYXRhWzBdIHx8IDAsIGRhdGFbMV0gfHwgMCwgZGF0YVsyXSB8fCAwLCBkYXRhWzNdIHx8IDBdLCAnKTsnKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHZhciBidWZmZXIgPSBidWZmZXJTdGF0ZS5nZXRCdWZmZXIoZGF0YSlcbiAgICAgICAgICB2YXIgc2l6ZSA9IDBcbiAgICAgICAgICB2YXIgc3RyaWRlID0gMFxuICAgICAgICAgIHZhciBvZmZzZXQgPSAwXG4gICAgICAgICAgdmFyIGRpdmlzb3IgPSAwXG4gICAgICAgICAgdmFyIG5vcm1hbGl6ZWQgPSBmYWxzZVxuICAgICAgICAgIHZhciB0eXBlID0gR0xfRkxPQVRcblxuICAgICAgICAgIGlmICghYnVmZmVyKSB7XG4gICAgICAgICAgICBcblxuICAgICAgICAgICAgYnVmZmVyID0gYnVmZmVyU3RhdGUuZ2V0QnVmZmVyKGRhdGEuYnVmZmVyKVxuICAgICAgICAgICAgc2l6ZSA9IGRhdGEuc2l6ZSB8fCAwXG4gICAgICAgICAgICBzdHJpZGUgPSBkYXRhLnN0cmlkZSB8fCAwXG4gICAgICAgICAgICBvZmZzZXQgPSBkYXRhLm9mZnNldCB8fCAwXG4gICAgICAgICAgICBkaXZpc29yID0gZGF0YS5kaXZpc29yIHx8IDBcbiAgICAgICAgICAgIG5vcm1hbGl6ZWQgPSBkYXRhLm5vcm1hbGl6ZWQgfHwgZmFsc2VcblxuICAgICAgICAgICAgXG5cbiAgICAgICAgICAgIC8vIENoZWNrIGZvciB1c2VyIGRlZmluZWQgdHlwZSBvdmVybG9hZGluZ1xuICAgICAgICAgICAgdHlwZSA9IGJ1ZmZlci5kdHlwZVxuICAgICAgICAgICAgaWYgKCd0eXBlJyBpbiBkYXRhKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICB0eXBlID0gZ2xUeXBlc1tkYXRhLnR5cGVdXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHR5cGUgPSBidWZmZXIuZHR5cGVcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBcbiAgICAgICAgICBcbiAgICAgICAgICBcbiAgICAgICAgICBcbiAgICAgICAgICBcbiAgICAgICAgICBcblxuICAgICAgICAgIGVudHJ5KFxuICAgICAgICAgICAgQVRUUklCVVRFLCAnLnB1c2hQdHIoJywgW1xuICAgICAgICAgICAgICBsaW5rKGJ1ZmZlciksIHNpemUsIG9mZnNldCwgc3RyaWRlLFxuICAgICAgICAgICAgICBkaXZpc29yLCBub3JtYWxpemVkLCB0eXBlXG4gICAgICAgICAgICBdLmpvaW4oKSwgJyk7JylcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgZXhpdChBVFRSSUJVVEUsICcucG9wKCk7JylcbiAgICB9KVxuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIERZTkFNSUMgU1RBVEUgKGZvciBzY29wZSBhbmQgZHJhdylcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gR2VuZXJhdGVkIGNvZGUgYmxvY2tzIGZvciBkeW5hbWljIHN0YXRlIGZsYWdzXG4gICAgdmFyIGR5bmFtaWNFbnRyeSA9IGVudi5ibG9jaygpXG4gICAgdmFyIGR5bmFtaWNFeGl0ID0gZW52LmJsb2NrKClcblxuICAgIHZhciBGUkFNRVNUQVRFXG4gICAgdmFyIERZTkFSR1NcbiAgICBpZiAoaGFzRHluYW1pYykge1xuICAgICAgRlJBTUVTVEFURSA9IGxpbmsoZnJhbWVTdGF0ZSlcbiAgICAgIERZTkFSR1MgPSBlbnRyeS5kZWYoKVxuICAgIH1cblxuICAgIHZhciBkeW5hbWljVmFycyA9IHt9XG4gICAgZnVuY3Rpb24gZHluICh4KSB7XG4gICAgICB2YXIgaWQgPSB4LmlkXG4gICAgICB2YXIgcmVzdWx0ID0gZHluYW1pY1ZhcnNbaWRdXG4gICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH1cbiAgICAgIGlmICh4LmZ1bmMpIHtcbiAgICAgICAgcmVzdWx0ID0gZHluYW1pY0VudHJ5LmRlZihcbiAgICAgICAgICBsaW5rKHguZGF0YSksICcoJywgRFlOQVJHUywgJywwLCcsIEZSQU1FU1RBVEUsICcpJylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc3VsdCA9IGR5bmFtaWNFbnRyeS5kZWYoRFlOQVJHUywgJy4nLCB4LmRhdGEpXG4gICAgICB9XG4gICAgICBkeW5hbWljVmFyc1tpZF0gPSByZXN1bHRcbiAgICAgIHJldHVybiByZXN1bHRcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gZHluYW1pYyBjb250ZXh0IHN0YXRlIHZhcmlhYmxlc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBPYmplY3Qua2V5cyhkeW5hbWljT3B0aW9ucykuc29ydChvcHRpb25Qcmlvcml0eSkuZm9yRWFjaChmdW5jdGlvbiAocGFyYW0pIHtcbiAgICAgIC8vIExpbmsgaW4gZHluYW1pYyB2YXJpYWJsZVxuICAgICAgdmFyIHZhcmlhYmxlID0gZHluKGR5bmFtaWNPcHRpb25zW3BhcmFtXSlcblxuICAgICAgc3dpdGNoIChwYXJhbSkge1xuICAgICAgICBjYXNlICdmcmFtZWJ1ZmZlcic6XG4gICAgICAgICAgdmFyIFZJRVdQT1JUX1NUQVRFID0gbGlua0NvbnRleHQoJ3ZpZXdwb3J0JylcbiAgICAgICAgICB2YXIgU0NJU1NPUl9TVEFURSA9IGxpbmtDb250ZXh0KCdzY2lzc29yLmJveCcpXG4gICAgICAgICAgZHluYW1pY0VudHJ5KCdpZignLFxuICAgICAgICAgICAgRlJBTUVCVUZGRVJfU1RBVEUsICcucHVzaCgnLFxuICAgICAgICAgICAgdmFyaWFibGUsICcmJicsIHZhcmlhYmxlLCAnLl9mcmFtZWJ1ZmZlcikpeycsXG4gICAgICAgICAgICBWSUVXUE9SVF9TVEFURSwgJy5zZXREaXJ0eSgpOycsXG4gICAgICAgICAgICBTQ0lTU09SX1NUQVRFLCAnLnNldERpcnR5KCk7JyxcbiAgICAgICAgICAgICd9JylcbiAgICAgICAgICBkeW5hbWljRXhpdCgnaWYoJyxcbiAgICAgICAgICAgIEZSQU1FQlVGRkVSX1NUQVRFLCAnLnBvcCgpKXsnLFxuICAgICAgICAgICAgVklFV1BPUlRfU1RBVEUsICcuc2V0RGlydHkoKTsnLFxuICAgICAgICAgICAgU0NJU1NPUl9TVEFURSwgJy5zZXREaXJ0eSgpOycsXG4gICAgICAgICAgICAnfScpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdjdWxsLmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ2JsZW5kLmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ2RpdGhlcic6XG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwuZW5hYmxlJzpcbiAgICAgICAgY2FzZSAnZGVwdGguZW5hYmxlJzpcbiAgICAgICAgY2FzZSAnc2Npc3Nvci5lbmFibGUnOlxuICAgICAgICBjYXNlICdwb2x5Z29uT2Zmc2V0LmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ3NhbXBsZS5hbHBoYSc6XG4gICAgICAgIGNhc2UgJ3NhbXBsZS5lbmFibGUnOlxuICAgICAgICBjYXNlICdsaW5lV2lkdGgnOlxuICAgICAgICBjYXNlICdkZXB0aC5tYXNrJzpcbiAgICAgICAgICB2YXIgU1RBVEVfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBkeW5hbWljRW50cnkoU1RBVEVfU1RBQ0ssICcucHVzaCgnLCB2YXJpYWJsZSwgJyk7JylcbiAgICAgICAgICBkeW5hbWljRXhpdChTVEFURV9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgLy8gRHJhdyBjYWxsc1xuICAgICAgICBjYXNlICdjb3VudCc6XG4gICAgICAgIGNhc2UgJ29mZnNldCc6XG4gICAgICAgIGNhc2UgJ2luc3RhbmNlcyc6XG4gICAgICAgICAgdmFyIERSQVdfU1RBQ0sgPSBEUkFXX1NUQVRFW3BhcmFtXVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShEUkFXX1NUQUNLLCAnLnB1c2goJywgdmFyaWFibGUsICcpOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoRFJBV19TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAncHJpbWl0aXZlJzpcbiAgICAgICAgICB2YXIgUFJJTV9TVEFDSyA9IERSQVdfU1RBVEUucHJpbWl0aXZlXG4gICAgICAgICAgZHluYW1pY0VudHJ5KFBSSU1fU1RBQ0ssICcucHVzaCgnLCBQUklNX1RZUEVTLCAnWycsIHZhcmlhYmxlLCAnXSk7JylcbiAgICAgICAgICBkeW5hbWljRXhpdChQUklNX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdkZXB0aC5mdW5jJzpcbiAgICAgICAgICB2YXIgREVQVEhfRlVOQ19TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShERVBUSF9GVU5DX1NUQUNLLCAnLnB1c2goJywgQ09NUEFSRV9GVU5DUywgJ1snLCB2YXJpYWJsZSwgJ10pOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoREVQVEhfRlVOQ19TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnYmxlbmQuZnVuYyc6XG4gICAgICAgICAgdmFyIEJMRU5EX0ZVTkNfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICB2YXIgQkxFTkRfRlVOQ1MgPSBsaW5rKGJsZW5kRnVuY3MpXG4gICAgICAgICAgZHluYW1pY0VudHJ5KFxuICAgICAgICAgICAgQkxFTkRfRlVOQ19TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICBCTEVORF9GVU5DUyxcbiAgICAgICAgICAgICdbXCJzcmNSR0JcIiBpbiAnLCB2YXJpYWJsZSwgJz8nLCB2YXJpYWJsZSwgJy5zcmNSR0I6JywgdmFyaWFibGUsICcuc3JjXSwnLFxuICAgICAgICAgICAgQkxFTkRfRlVOQ1MsXG4gICAgICAgICAgICAnW1wiZHN0UkdCXCIgaW4gJywgdmFyaWFibGUsICc/JywgdmFyaWFibGUsICcuZHN0UkdCOicsIHZhcmlhYmxlLCAnLmRzdF0sJyxcbiAgICAgICAgICAgIEJMRU5EX0ZVTkNTLFxuICAgICAgICAgICAgJ1tcInNyY0FscGhhXCIgaW4gJywgdmFyaWFibGUsICc/JywgdmFyaWFibGUsICcuc3JjQWxwaGE6JywgdmFyaWFibGUsICcuc3JjXSwnLFxuICAgICAgICAgICAgQkxFTkRfRlVOQ1MsXG4gICAgICAgICAgICAnW1wiZHN0QWxwaGFcIiBpbiAnLCB2YXJpYWJsZSwgJz8nLCB2YXJpYWJsZSwgJy5kc3RBbHBoYTonLCB2YXJpYWJsZSwgJy5kc3RdKTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KEJMRU5EX0ZVTkNfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2JsZW5kLmVxdWF0aW9uJzpcbiAgICAgICAgICB2YXIgQkxFTkRfRVFVQVRJT05fU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICB2YXIgQkxFTkRfRVFVQVRJT05TID0gbGluayhibGVuZEVxdWF0aW9ucylcbiAgICAgICAgICBkeW5hbWljRW50cnkoXG4gICAgICAgICAgICAnaWYodHlwZW9mICcsIHZhcmlhYmxlLCAnPT09XCJzdHJpbmdcIil7JyxcbiAgICAgICAgICAgIEJMRU5EX0VRVUFUSU9OX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIEJMRU5EX0VRVUFUSU9OUywgJ1snLCB2YXJpYWJsZSwgJ10sJyxcbiAgICAgICAgICAgIEJMRU5EX0VRVUFUSU9OUywgJ1snLCB2YXJpYWJsZSwgJ10pOycsXG4gICAgICAgICAgICAnfWVsc2V7JyxcbiAgICAgICAgICAgIEJMRU5EX0VRVUFUSU9OX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIEJMRU5EX0VRVUFUSU9OUywgJ1snLCB2YXJpYWJsZSwgJy5yZ2JdLCcsXG4gICAgICAgICAgICBCTEVORF9FUVVBVElPTlMsICdbJywgdmFyaWFibGUsICcuYWxwaGFdKTsnLFxuICAgICAgICAgICAgJ30nKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KEJMRU5EX0VRVUFUSU9OX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdibGVuZC5jb2xvcic6XG4gICAgICAgICAgdmFyIEJMRU5EX0NPTE9SX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZHluYW1pY0VudHJ5KEJMRU5EX0NPTE9SX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnWzBdLCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJ1sxXSwnLFxuICAgICAgICAgICAgdmFyaWFibGUsICdbMl0sJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnWzNdKTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KEJMRU5EX0NPTE9SX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdzdGVuY2lsLm1hc2snOlxuICAgICAgICAgIHZhciBTVEVOQ0lMX01BU0tfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBkeW5hbWljRW50cnkoU1RFTkNJTF9NQVNLX1NUQUNLLCAnLnB1c2goJywgdmFyaWFibGUsICcpOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoU1RFTkNJTF9NQVNLX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdzdGVuY2lsLmZ1bmMnOlxuICAgICAgICAgIHZhciBTVEVOQ0lMX0ZVTkNfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBkeW5hbWljRW50cnkoU1RFTkNJTF9GVU5DX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIENPTVBBUkVfRlVOQ1MsICdbJywgdmFyaWFibGUsICcuY21wXSwnLFxuICAgICAgICAgICAgdmFyaWFibGUsICcucmVmfDAsJyxcbiAgICAgICAgICAgICdcIm1hc2tcIiBpbiAnLCB2YXJpYWJsZSwgJz8nLCB2YXJpYWJsZSwgJy5tYXNrOi0xKTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KFNURU5DSUxfRlVOQ19TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnc3RlbmNpbC5vcEZyb250JzpcbiAgICAgICAgY2FzZSAnc3RlbmNpbC5vcEJhY2snOlxuICAgICAgICAgIHZhciBTVEVOQ0lMX09QX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZHluYW1pY0VudHJ5KFNURU5DSUxfT1BfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgU1RFTkNJTF9PUFMsICdbJywgdmFyaWFibGUsICcuZmFpbHx8XCJrZWVwXCJdLCcsXG4gICAgICAgICAgICBTVEVOQ0lMX09QUywgJ1snLCB2YXJpYWJsZSwgJy56ZmFpbHx8XCJrZWVwXCJdLCcsXG4gICAgICAgICAgICBTVEVOQ0lMX09QUywgJ1snLCB2YXJpYWJsZSwgJy5wYXNzfHxcImtlZXBcIl0pOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoU1RFTkNJTF9PUF9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAncG9seWdvbk9mZnNldC5vZmZzZXQnOlxuICAgICAgICAgIHZhciBQT0xZR09OX09GRlNFVF9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShQT0xZR09OX09GRlNFVF9TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJy5mYWN0b3J8fDAsJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnLnVuaXRzfHwwKTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KFBPTFlHT05fT0ZGU0VUX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdjdWxsLmZhY2UnOlxuICAgICAgICAgIHZhciBDVUxMX0ZBQ0VfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBkeW5hbWljRW50cnkoQ1VMTF9GQUNFX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnPT09XCJmcm9udFwiPycsIEdMX0ZST05ULCAnOicsIEdMX0JBQ0ssICcpOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoQ1VMTF9GQUNFX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdmcm9udEZhY2UnOlxuICAgICAgICAgIHZhciBGUk9OVF9GQUNFX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZHluYW1pY0VudHJ5KEZST05UX0ZBQ0VfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgdmFyaWFibGUsICc9PT1cImN3XCI/JywgR0xfQ1csICc6JywgR0xfQ0NXLCAnKTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KEZST05UX0ZBQ0VfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2NvbG9yTWFzayc6XG4gICAgICAgICAgdmFyIENPTE9SX01BU0tfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBkeW5hbWljRW50cnkoQ09MT1JfTUFTS19TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJ1swXSwnLFxuICAgICAgICAgICAgdmFyaWFibGUsICdbMV0sJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnWzJdLCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJ1szXSk7JylcbiAgICAgICAgICBkeW5hbWljRXhpdChDT0xPUl9NQVNLX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdzYW1wbGUuY292ZXJhZ2UnOlxuICAgICAgICAgIHZhciBTQU1QTEVfQ09WRVJBR0VfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBkeW5hbWljRW50cnkoU0FNUExFX0NPVkVSQUdFX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnLnZhbHVlLCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJy5pbnZlcnQpOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoU0FNUExFX0NPVkVSQUdFX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdzY2lzc29yLmJveCc6XG4gICAgICAgIGNhc2UgJ3ZpZXdwb3J0JzpcbiAgICAgICAgICB2YXIgQk9YX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZHluYW1pY0VudHJ5KEJPWF9TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJy54fHwwLCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJy55fHwwLCcsXG4gICAgICAgICAgICAnXCJ3XCIgaW4gJywgdmFyaWFibGUsICc/JywgdmFyaWFibGUsICcudzotMSwnLFxuICAgICAgICAgICAgJ1wiaFwiIGluICcsIHZhcmlhYmxlLCAnPycsIHZhcmlhYmxlLCAnLmg6LTEpOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoQk9YX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdlbGVtZW50cyc6XG4gICAgICAgICAgdmFyIGhhc1ByaW1pdGl2ZSA9XG4gICAgICAgICAgISgncHJpbWl0aXZlJyBpbiBkeW5hbWljT3B0aW9ucykgJiZcbiAgICAgICAgICAgICEoJ3ByaW1pdGl2ZScgaW4gc3RhdGljT3B0aW9ucylcbiAgICAgICAgICB2YXIgaGFzQ291bnQgPVxuICAgICAgICAgICEoJ2NvdW50JyBpbiBkeW5hbWljT3B0aW9ucykgJiZcbiAgICAgICAgICAgICEoJ2NvdW50JyBpbiBzdGF0aWNPcHRpb25zKVxuICAgICAgICAgIHZhciBoYXNPZmZzZXQgPVxuICAgICAgICAgICEoJ29mZnNldCcgaW4gZHluYW1pY09wdGlvbnMpICYmXG4gICAgICAgICAgICAhKCdvZmZzZXQnIGluIHN0YXRpY09wdGlvbnMpXG4gICAgICAgICAgdmFyIEVMRU1FTlRTID0gZHluYW1pY0VudHJ5LmRlZigpXG4gICAgICAgICAgZHluYW1pY0VudHJ5KFxuICAgICAgICAgICAgJ2lmKCcsIHZhcmlhYmxlLCAnKXsnLFxuICAgICAgICAgICAgRUxFTUVOVFMsICc9JywgdmFyaWFibGUsICcuX2VsZW1lbnRzOycsXG4gICAgICAgICAgICBFTEVNRU5UX1NUQVRFLCAnLnB1c2goJywgRUxFTUVOVFMsICcpOycsXG4gICAgICAgICAgICAhaGFzUHJpbWl0aXZlID8gJydcbiAgICAgICAgICAgICAgOiBEUkFXX1NUQVRFLnByaW1pdGl2ZSArICcucHVzaCgnICsgRUxFTUVOVFMgKyAnLnByaW1UeXBlKTsnLFxuICAgICAgICAgICAgIWhhc0NvdW50ID8gJydcbiAgICAgICAgICAgICAgOiBEUkFXX1NUQVRFLmNvdW50ICsgJy5wdXNoKCcgKyBFTEVNRU5UUyArICcudmVydENvdW50KTsnLFxuICAgICAgICAgICAgIWhhc09mZnNldCA/ICcnXG4gICAgICAgICAgICAgIDogRFJBV19TVEFURS5vZmZzZXQgKyAnLnB1c2goJyArIEVMRU1FTlRTICsgJy5vZmZzZXQpOycsXG4gICAgICAgICAgICAnfWVsc2V7JyxcbiAgICAgICAgICAgIEVMRU1FTlRfU1RBVEUsICcucHVzaChudWxsKTsnLFxuICAgICAgICAgICAgJ30nKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KFxuICAgICAgICAgICAgRUxFTUVOVF9TVEFURSwgJy5wb3AoKTsnLFxuICAgICAgICAgICAgJ2lmKCcsIHZhcmlhYmxlLCAnKXsnLFxuICAgICAgICAgICAgaGFzUHJpbWl0aXZlID8gRFJBV19TVEFURS5wcmltaXRpdmUgKyAnLnBvcCgpOycgOiAnJyxcbiAgICAgICAgICAgIGhhc0NvdW50ID8gRFJBV19TVEFURS5jb3VudCArICcucG9wKCk7JyA6ICcnLFxuICAgICAgICAgICAgaGFzT2Zmc2V0ID8gRFJBV19TVEFURS5vZmZzZXQgKyAnLnBvcCgpOycgOiAnJyxcbiAgICAgICAgICAgICd9JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBkeW5hbWljIHVuaWZvcm1zXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIE9iamVjdC5rZXlzKGR5bmFtaWNVbmlmb3JtcykuZm9yRWFjaChmdW5jdGlvbiAodW5pZm9ybSkge1xuICAgICAgdmFyIFNUQUNLID0gbGluayh1bmlmb3JtU3RhdGUuZGVmKHVuaWZvcm0pKVxuICAgICAgdmFyIFZBTFVFID0gZHluKGR5bmFtaWNVbmlmb3Jtc1t1bmlmb3JtXSlcbiAgICAgIGR5bmFtaWNFbnRyeShTVEFDSywgJy5wdXNoKCcsIFZBTFVFLCAnKTsnKVxuICAgICAgZHluYW1pY0V4aXQoU1RBQ0ssICcucG9wKCk7JylcbiAgICB9KVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGR5bmFtaWMgYXR0cmlidXRlc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBPYmplY3Qua2V5cyhkeW5hbWljQXR0cmlidXRlcykuZm9yRWFjaChmdW5jdGlvbiAoYXR0cmlidXRlKSB7XG4gICAgICB2YXIgQVRUUklCVVRFID0gbGluayhhdHRyaWJ1dGVTdGF0ZS5kZWYoYXR0cmlidXRlKSlcbiAgICAgIHZhciBWQUxVRSA9IGR5bihkeW5hbWljQXR0cmlidXRlc1thdHRyaWJ1dGVdKVxuICAgICAgZHluYW1pY0VudHJ5KEFUVFJJQlVURSwgJy5wdXNoRHluKCcsIFZBTFVFLCAnKTsnKVxuICAgICAgZHluYW1pY0V4aXQoQVRUUklCVVRFLCAnLnBvcCgpOycpXG4gICAgfSlcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBTQ09QRSBQUk9DRURVUkVcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgdmFyIHNjb3BlID0gcHJvYygnc2NvcGUnKVxuICAgIHZhciBTQ09QRV9BUkdTID0gc2NvcGUuYXJnKClcbiAgICB2YXIgU0NPUEVfQk9EWSA9IHNjb3BlLmFyZygpXG4gICAgc2NvcGUoZW50cnkpXG4gICAgaWYgKGhhc0R5bmFtaWMpIHtcbiAgICAgIHNjb3BlKFxuICAgICAgICBEWU5BUkdTLCAnPScsIFNDT1BFX0FSR1MsICc7JyxcbiAgICAgICAgZHluYW1pY0VudHJ5KVxuICAgIH1cbiAgICBzY29wZShcbiAgICAgIFNDT1BFX0JPRFksICcoKTsnLFxuICAgICAgaGFzRHluYW1pYyA/IGR5bmFtaWNFeGl0IDogJycsXG4gICAgICBleGl0KVxuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIERSQVcgUFJPQ0VEVVJFXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIHZhciBkcmF3ID0gcHJvYygnZHJhdycpXG4gICAgZHJhdyhlbnRyeSlcbiAgICBpZiAoaGFzRHluYW1pYykge1xuICAgICAgZHJhdyhcbiAgICAgICAgRFlOQVJHUywgJz0nLCBkcmF3LmFyZygpLCAnOycsXG4gICAgICAgIGR5bmFtaWNFbnRyeSlcbiAgICB9XG4gICAgdmFyIENVUlJFTlRfU0hBREVSID0gc3RhY2tUb3AoUFJPR1JBTV9TVEFURSlcbiAgICBkcmF3KFxuICAgICAgR0xfUE9MTCwgJygpOycsXG4gICAgICAnaWYoJywgQ1VSUkVOVF9TSEFERVIsICcpJyxcbiAgICAgIENVUlJFTlRfU0hBREVSLCAnLmRyYXcoJywgaGFzRHluYW1pYyA/IERZTkFSR1MgOiAnJywgJyk7JyxcbiAgICAgIGhhc0R5bmFtaWMgPyBkeW5hbWljRXhpdCA6ICcnLFxuICAgICAgZXhpdClcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBCQVRDSCBEUkFXXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIHZhciBiYXRjaCA9IHByb2MoJ2JhdGNoJylcbiAgICBiYXRjaChlbnRyeSlcbiAgICB2YXIgQ1VSX1NIQURFUiA9IGJhdGNoLmRlZihzdGFja1RvcChQUk9HUkFNX1NUQVRFKSlcbiAgICB2YXIgRVhFQ19CQVRDSCA9IGxpbmsoZnVuY3Rpb24gKHByb2dyYW0sIGNvdW50LCBhcmdzKSB7XG4gICAgICB2YXIgcHJvYyA9IHByb2dyYW0uYmF0Y2hDYWNoZVtjYWxsSWRdXG4gICAgICBpZiAoIXByb2MpIHtcbiAgICAgICAgcHJvYyA9IHByb2dyYW0uYmF0Y2hDYWNoZVtjYWxsSWRdID0gY29tcGlsZUJhdGNoKFxuICAgICAgICAgIHByb2dyYW0sIGR5bmFtaWNPcHRpb25zLCBkeW5hbWljVW5pZm9ybXMsIGR5bmFtaWNBdHRyaWJ1dGVzLFxuICAgICAgICAgIHN0YXRpY09wdGlvbnMpXG4gICAgICB9XG4gICAgICByZXR1cm4gcHJvYyhjb3VudCwgYXJncylcbiAgICB9KVxuICAgIGJhdGNoKFxuICAgICAgJ2lmKCcsIENVUl9TSEFERVIsICcpeycsXG4gICAgICBHTF9QT0xMLCAnKCk7JyxcbiAgICAgIEVYRUNfQkFUQ0gsICcoJyxcbiAgICAgIENVUl9TSEFERVIsICcsJyxcbiAgICAgIGJhdGNoLmFyZygpLCAnLCcsXG4gICAgICBiYXRjaC5hcmcoKSwgJyk7JylcbiAgICAvLyBTZXQgZGlydHkgb24gYWxsIGR5bmFtaWMgZmxhZ3NcbiAgICBPYmplY3Qua2V5cyhkeW5hbWljT3B0aW9ucykuZm9yRWFjaChmdW5jdGlvbiAob3B0aW9uKSB7XG4gICAgICB2YXIgU1RBVEUgPSBDT05URVhUX1NUQVRFW29wdGlvbl1cbiAgICAgIGlmIChTVEFURSkge1xuICAgICAgICBiYXRjaChTVEFURSwgJy5zZXREaXJ0eSgpOycpXG4gICAgICB9XG4gICAgfSlcbiAgICBiYXRjaCgnfScsIGV4aXQpXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gZXZhbCBhbmQgYmluZFxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICByZXR1cm4gZW52LmNvbXBpbGUoKVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBkcmF3OiBjb21waWxlU2hhZGVyRHJhdyxcbiAgICBjb21tYW5kOiBjb21waWxlQ29tbWFuZFxuICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gIFwiW29iamVjdCBJbnQ4QXJyYXldXCI6IDUxMjBcbiwgXCJbb2JqZWN0IEludDE2QXJyYXldXCI6IDUxMjJcbiwgXCJbb2JqZWN0IEludDMyQXJyYXldXCI6IDUxMjRcbiwgXCJbb2JqZWN0IFVpbnQ4QXJyYXldXCI6IDUxMjFcbiwgXCJbb2JqZWN0IFVpbnQ4Q2xhbXBlZEFycmF5XVwiOiA1MTIxXG4sIFwiW29iamVjdCBVaW50MTZBcnJheV1cIjogNTEyM1xuLCBcIltvYmplY3QgVWludDMyQXJyYXldXCI6IDUxMjVcbiwgXCJbb2JqZWN0IEZsb2F0MzJBcnJheV1cIjogNTEyNlxuLCBcIltvYmplY3QgRmxvYXQ2NEFycmF5XVwiOiA1MTIxXG4sIFwiW29iamVjdCBBcnJheUJ1ZmZlcl1cIjogNTEyMVxufVxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICBcImludDhcIjogNTEyMFxuLCBcImludDE2XCI6IDUxMjJcbiwgXCJpbnQzMlwiOiA1MTI0XG4sIFwidWludDhcIjogNTEyMVxuLCBcInVpbnQxNlwiOiA1MTIzXG4sIFwidWludDMyXCI6IDUxMjVcbiwgXCJmbG9hdFwiOiA1MTI2XG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gIFwicG9pbnRzXCI6IDAsXG4gIFwibGluZXNcIjogMSxcbiAgXCJsaW5lIGxvb3BcIjogMixcbiAgXCJsaW5lIHN0cmlwXCI6IDMsXG4gIFwidHJpYW5nbGVzXCI6IDQsXG4gIFwidHJpYW5nbGUgc3RyaXBcIjogNSxcbiAgXCJ0cmlhbmdsZSBmYW5cIjogNlxufVxuIiwiLy8gQ29udGV4dCBhbmQgY2FudmFzIGNyZWF0aW9uIGhlbHBlciBmdW5jdGlvbnNcbi8qZ2xvYmFscyBIVE1MRWxlbWVudCxXZWJHTFJlbmRlcmluZ0NvbnRleHQqL1xuXG5cbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL2V4dGVuZCcpXG5cbmZ1bmN0aW9uIGNyZWF0ZUNhbnZhcyAoZWxlbWVudCwgb3B0aW9ucykge1xuICB2YXIgY2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJylcbiAgdmFyIGFyZ3MgPSBnZXRDb250ZXh0KGNhbnZhcywgb3B0aW9ucylcblxuICBleHRlbmQoY2FudmFzLnN0eWxlLCB7XG4gICAgYm9yZGVyOiAwLFxuICAgIG1hcmdpbjogMCxcbiAgICBwYWRkaW5nOiAwLFxuICAgIHRvcDogMCxcbiAgICBsZWZ0OiAwXG4gIH0pXG4gIGVsZW1lbnQuYXBwZW5kQ2hpbGQoY2FudmFzKVxuXG4gIGlmIChlbGVtZW50ID09PSBkb2N1bWVudC5ib2R5KSB7XG4gICAgY2FudmFzLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJ1xuICAgIGV4dGVuZChlbGVtZW50LnN0eWxlLCB7XG4gICAgICBtYXJnaW46IDAsXG4gICAgICBwYWRkaW5nOiAwXG4gICAgfSlcbiAgfVxuXG4gIHZhciBzY2FsZSA9ICthcmdzLm9wdGlvbnMucGl4ZWxSYXRpb1xuICBmdW5jdGlvbiByZXNpemUgKCkge1xuICAgIHZhciB3ID0gd2luZG93LmlubmVyV2lkdGhcbiAgICB2YXIgaCA9IHdpbmRvdy5pbm5lckhlaWdodFxuICAgIGlmIChlbGVtZW50ICE9PSBkb2N1bWVudC5ib2R5KSB7XG4gICAgICB2YXIgYm91bmRzID0gZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKVxuICAgICAgdyA9IGJvdW5kcy5yaWdodCAtIGJvdW5kcy5sZWZ0XG4gICAgICBoID0gYm91bmRzLnRvcCAtIGJvdW5kcy5ib3R0b21cbiAgICB9XG4gICAgY2FudmFzLndpZHRoID0gc2NhbGUgKiB3XG4gICAgY2FudmFzLmhlaWdodCA9IHNjYWxlICogaFxuICAgIGV4dGVuZChjYW52YXMuc3R5bGUsIHtcbiAgICAgIHdpZHRoOiB3ICsgJ3B4JyxcbiAgICAgIGhlaWdodDogaCArICdweCdcbiAgICB9KVxuICB9XG5cbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIHJlc2l6ZSwgZmFsc2UpXG5cbiAgdmFyIHByZXZEZXN0cm95ID0gYXJncy5vcHRpb25zLm9uRGVzdHJveVxuICBhcmdzLm9wdGlvbnMgPSBleHRlbmQoZXh0ZW5kKHt9LCBhcmdzLm9wdGlvbnMpLCB7XG4gICAgb25EZXN0cm95OiBmdW5jdGlvbiAoKSB7XG4gICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigncmVzaXplJywgcmVzaXplKVxuICAgICAgZWxlbWVudC5yZW1vdmVDaGlsZChjYW52YXMpXG4gICAgICBwcmV2RGVzdHJveSAmJiBwcmV2RGVzdHJveSgpXG4gICAgfVxuICB9KVxuXG4gIHJlc2l6ZSgpXG5cbiAgcmV0dXJuIGFyZ3Ncbn1cblxuZnVuY3Rpb24gZ2V0Q29udGV4dCAoY2FudmFzLCBvcHRpb25zKSB7XG4gIHZhciBnbE9wdGlvbnMgPSBvcHRpb25zLmdsT3B0aW9ucyB8fCB7fVxuXG4gIGZ1bmN0aW9uIGdldCAobmFtZSkge1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gY2FudmFzLmdldENvbnRleHQobmFtZSwgZ2xPcHRpb25zKVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuICB9XG5cbiAgdmFyIGdsID0gZ2V0KCd3ZWJnbCcpIHx8XG4gICAgICAgICAgIGdldCgnZXhwZXJpbWVudGFsLXdlYmdsJykgfHxcbiAgICAgICAgICAgZ2V0KCd3ZWJnbC1leHBlcmltZW50YWwnKVxuXG4gIFxuXG4gIHJldHVybiB7XG4gICAgZ2w6IGdsLFxuICAgIG9wdGlvbnM6IGV4dGVuZCh7XG4gICAgICBwaXhlbFJhdGlvOiB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpb1xuICAgIH0sIG9wdGlvbnMpXG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBwYXJzZUFyZ3MgKGFyZ3MpIHtcbiAgaWYgKHR5cGVvZiBkb2N1bWVudCA9PT0gJ3VuZGVmaW5lZCcgfHxcbiAgICAgIHR5cGVvZiBIVE1MRWxlbWVudCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICByZXR1cm4ge1xuICAgICAgZ2w6IGFyZ3NbMF0sXG4gICAgICBvcHRpb25zOiBhcmdzWzFdIHx8IHt9XG4gICAgfVxuICB9XG5cbiAgdmFyIGVsZW1lbnQgPSBkb2N1bWVudC5ib2R5XG4gIHZhciBvcHRpb25zID0gYXJnc1sxXSB8fCB7fVxuXG4gIGlmICh0eXBlb2YgYXJnc1swXSA9PT0gJ3N0cmluZycpIHtcbiAgICBlbGVtZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihhcmdzWzBdKSB8fCBkb2N1bWVudC5ib2R5XG4gIH0gZWxzZSBpZiAodHlwZW9mIGFyZ3NbMF0gPT09ICdvYmplY3QnKSB7XG4gICAgaWYgKGFyZ3NbMF0gaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkge1xuICAgICAgZWxlbWVudCA9IGFyZ3NbMF1cbiAgICB9IGVsc2UgaWYgKGFyZ3NbMF0gaW5zdGFuY2VvZiBXZWJHTFJlbmRlcmluZ0NvbnRleHQpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGdsOiBhcmdzWzBdLFxuICAgICAgICBvcHRpb25zOiBleHRlbmQoe1xuICAgICAgICAgIHBpeGVsUmF0aW86IDFcbiAgICAgICAgfSwgb3B0aW9ucylcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgb3B0aW9ucyA9IGFyZ3NbMF1cbiAgICB9XG4gIH1cblxuICBpZiAoZWxlbWVudC5ub2RlTmFtZSAmJiBlbGVtZW50Lm5vZGVOYW1lLnRvVXBwZXJDYXNlKCkgPT09ICdDQU5WQVMnKSB7XG4gICAgcmV0dXJuIGdldENvbnRleHQoZWxlbWVudCwgb3B0aW9ucylcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gY3JlYXRlQ2FudmFzKGVsZW1lbnQsIG9wdGlvbnMpXG4gIH1cbn1cbiIsInZhciBHTF9UUklBTkdMRVMgPSA0XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcERyYXdTdGF0ZSAoZ2wpIHtcbiAgdmFyIHByaW1pdGl2ZSA9IFsgR0xfVFJJQU5HTEVTIF1cbiAgdmFyIGNvdW50ID0gWyAwIF1cbiAgdmFyIG9mZnNldCA9IFsgMCBdXG4gIHZhciBpbnN0YW5jZXMgPSBbIDAgXVxuXG4gIHJldHVybiB7XG4gICAgcHJpbWl0aXZlOiBwcmltaXRpdmUsXG4gICAgY291bnQ6IGNvdW50LFxuICAgIG9mZnNldDogb2Zmc2V0LFxuICAgIGluc3RhbmNlczogaW5zdGFuY2VzXG4gIH1cbn1cbiIsInZhciBWQVJJQUJMRV9DT1VOVEVSID0gMFxuXG5mdW5jdGlvbiBEeW5hbWljVmFyaWFibGUgKGlzRnVuYywgZGF0YSkge1xuICB0aGlzLmlkID0gKFZBUklBQkxFX0NPVU5URVIrKylcbiAgdGhpcy5mdW5jID0gaXNGdW5jXG4gIHRoaXMuZGF0YSA9IGRhdGFcbn1cblxuZnVuY3Rpb24gZGVmaW5lRHluYW1pYyAoZGF0YSwgcGF0aCkge1xuICBzd2l0Y2ggKHR5cGVvZiBkYXRhKSB7XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgcmV0dXJuIG5ldyBEeW5hbWljVmFyaWFibGUoZmFsc2UsIGRhdGEpXG4gICAgY2FzZSAnZnVuY3Rpb24nOlxuICAgICAgcmV0dXJuIG5ldyBEeW5hbWljVmFyaWFibGUodHJ1ZSwgZGF0YSlcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIGRlZmluZUR5bmFtaWNcbiAgfVxufVxuXG5mdW5jdGlvbiBpc0R5bmFtaWMgKHgpIHtcbiAgcmV0dXJuICh0eXBlb2YgeCA9PT0gJ2Z1bmN0aW9uJyAmJiAheC5fcmVnbFR5cGUpIHx8XG4gICAgICAgICB4IGluc3RhbmNlb2YgRHluYW1pY1ZhcmlhYmxlXG59XG5cbmZ1bmN0aW9uIHVuYm94ICh4LCBwYXRoKSB7XG4gIGlmICh4IGluc3RhbmNlb2YgRHluYW1pY1ZhcmlhYmxlKSB7XG4gICAgcmV0dXJuIHhcbiAgfSBlbHNlIGlmICh0eXBlb2YgeCA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgICAgICAgIHggIT09IGRlZmluZUR5bmFtaWMpIHtcbiAgICByZXR1cm4gbmV3IER5bmFtaWNWYXJpYWJsZSh0cnVlLCB4KVxuICB9XG4gIHJldHVybiBuZXcgRHluYW1pY1ZhcmlhYmxlKGZhbHNlLCBwYXRoKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgZGVmaW5lOiBkZWZpbmVEeW5hbWljLFxuICBpc0R5bmFtaWM6IGlzRHluYW1pYyxcbiAgdW5ib3g6IHVuYm94XG59XG4iLCJcbnZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL2lzLXR5cGVkLWFycmF5JylcbnZhciBpc05EQXJyYXlMaWtlID0gcmVxdWlyZSgnLi9pcy1uZGFycmF5JylcbnZhciBwcmltVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9wcmltaXRpdmVzLmpzb24nKVxuXG52YXIgR0xfUE9JTlRTID0gMFxudmFyIEdMX0xJTkVTID0gMVxudmFyIEdMX1RSSUFOR0xFUyA9IDRcblxudmFyIEdMX0JZVEUgPSA1MTIwXG52YXIgR0xfVU5TSUdORURfQllURSA9IDUxMjFcbnZhciBHTF9TSE9SVCA9IDUxMjJcbnZhciBHTF9VTlNJR05FRF9TSE9SVCA9IDUxMjNcbnZhciBHTF9JTlQgPSA1MTI0XG52YXIgR0xfVU5TSUdORURfSU5UID0gNTEyNVxuXG52YXIgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIgPSAzNDk2M1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBFbGVtZW50c1N0YXRlIChnbCwgZXh0ZW5zaW9ucywgYnVmZmVyU3RhdGUpIHtcbiAgdmFyIGVsZW1lbnRzID0gWyBudWxsIF1cblxuICBmdW5jdGlvbiBSRUdMRWxlbWVudEJ1ZmZlciAoKSB7XG4gICAgdGhpcy5idWZmZXIgPSBudWxsXG4gICAgdGhpcy5wcmltVHlwZSA9IEdMX1RSSUFOR0xFU1xuICAgIHRoaXMudmVydENvdW50ID0gMFxuICAgIHRoaXMudHlwZSA9IDBcbiAgfVxuXG4gIFJFR0xFbGVtZW50QnVmZmVyLnByb3RvdHlwZS5iaW5kID0gZnVuY3Rpb24gKCkge1xuICAgIHRoaXMuYnVmZmVyLmJpbmQoKVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlRWxlbWVudHMgKG9wdGlvbnMpIHtcbiAgICB2YXIgZWxlbWVudHMgPSBuZXcgUkVHTEVsZW1lbnRCdWZmZXIoKVxuICAgIHZhciBidWZmZXIgPSBidWZmZXJTdGF0ZS5jcmVhdGUobnVsbCwgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIsIHRydWUpXG4gICAgZWxlbWVudHMuYnVmZmVyID0gYnVmZmVyLl9idWZmZXJcblxuICAgIGZ1bmN0aW9uIHJlZ2xFbGVtZW50cyAoaW5wdXQpIHtcbiAgICAgIHZhciBvcHRpb25zID0gaW5wdXRcbiAgICAgIHZhciBleHQzMmJpdCA9IGV4dGVuc2lvbnMub2VzX2VsZW1lbnRfaW5kZXhfdWludFxuXG4gICAgICAvLyBVcGxvYWQgZGF0YSB0byB2ZXJ0ZXggYnVmZmVyXG4gICAgICBpZiAoIW9wdGlvbnMpIHtcbiAgICAgICAgYnVmZmVyKClcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIG9wdGlvbnMgPT09ICdudW1iZXInKSB7XG4gICAgICAgIGJ1ZmZlcihvcHRpb25zKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGRhdGEgPSBudWxsXG4gICAgICAgIHZhciB1c2FnZSA9ICdzdGF0aWMnXG4gICAgICAgIHZhciBieXRlTGVuZ3RoID0gMFxuICAgICAgICBpZiAoXG4gICAgICAgICAgQXJyYXkuaXNBcnJheShvcHRpb25zKSB8fFxuICAgICAgICAgIGlzVHlwZWRBcnJheShvcHRpb25zKSB8fFxuICAgICAgICAgIGlzTkRBcnJheUxpa2Uob3B0aW9ucykpIHtcbiAgICAgICAgICBkYXRhID0gb3B0aW9uc1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIFxuICAgICAgICAgIGlmICgnZGF0YScgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgZGF0YSA9IG9wdGlvbnMuZGF0YVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ3VzYWdlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICB1c2FnZSA9IG9wdGlvbnMudXNhZ2VcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCdsZW5ndGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGJ5dGVMZW5ndGggPSBvcHRpb25zLmxlbmd0aFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShkYXRhKSB8fFxuICAgICAgICAgICAgKGlzTkRBcnJheUxpa2UoZGF0YSkgJiYgZGF0YS5kdHlwZSA9PT0gJ2FycmF5JykgfHxcbiAgICAgICAgICAgICd0eXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgYnVmZmVyKHtcbiAgICAgICAgICAgIHR5cGU6IG9wdGlvbnMudHlwZSB8fFxuICAgICAgICAgICAgICAoZXh0MzJiaXRcbiAgICAgICAgICAgICAgICA/ICd1aW50MzInXG4gICAgICAgICAgICAgICAgOiAndWludDE2JyksXG4gICAgICAgICAgICB1c2FnZTogdXNhZ2UsXG4gICAgICAgICAgICBkYXRhOiBkYXRhLFxuICAgICAgICAgICAgbGVuZ3RoOiBieXRlTGVuZ3RoXG4gICAgICAgICAgfSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBidWZmZXIoe1xuICAgICAgICAgICAgdXNhZ2U6IHVzYWdlLFxuICAgICAgICAgICAgZGF0YTogZGF0YSxcbiAgICAgICAgICAgIGxlbmd0aDogYnl0ZUxlbmd0aFxuICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkgfHwgaXNUeXBlZEFycmF5KGRhdGEpKSB7XG4gICAgICAgICAgYnVmZmVyLmRpbWVuc2lvbiA9IDNcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyB0cnkgdG8gZ3Vlc3MgZGVmYXVsdCBwcmltaXRpdmUgdHlwZSBhbmQgYXJndW1lbnRzXG4gICAgICB2YXIgdmVydENvdW50ID0gZWxlbWVudHMuYnVmZmVyLmJ5dGVMZW5ndGhcbiAgICAgIHZhciB0eXBlID0gMFxuICAgICAgc3dpdGNoIChlbGVtZW50cy5idWZmZXIuZHR5cGUpIHtcbiAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9CWVRFOlxuICAgICAgICBjYXNlIEdMX0JZVEU6XG4gICAgICAgICAgdHlwZSA9IEdMX1VOU0lHTkVEX0JZVEVcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlQ6XG4gICAgICAgIGNhc2UgR0xfU0hPUlQ6XG4gICAgICAgICAgdHlwZSA9IEdMX1VOU0lHTkVEX1NIT1JUXG4gICAgICAgICAgdmVydENvdW50ID4+PSAxXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX0lOVDpcbiAgICAgICAgY2FzZSBHTF9JTlQ6XG4gICAgICAgICAgXG4gICAgICAgICAgdHlwZSA9IEdMX1VOU0lHTkVEX0lOVFxuICAgICAgICAgIHZlcnRDb3VudCA+Pj0gMlxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICBcbiAgICAgIH1cblxuICAgICAgLy8gdHJ5IHRvIGd1ZXNzIHByaW1pdGl2ZSB0eXBlIGZyb20gY2VsbCBkaW1lbnNpb25cbiAgICAgIHZhciBwcmltVHlwZSA9IEdMX1RSSUFOR0xFU1xuICAgICAgdmFyIGRpbWVuc2lvbiA9IGVsZW1lbnRzLmJ1ZmZlci5kaW1lbnNpb25cbiAgICAgIGlmIChkaW1lbnNpb24gPT09IDEpIHByaW1UeXBlID0gR0xfUE9JTlRTXG4gICAgICBpZiAoZGltZW5zaW9uID09PSAyKSBwcmltVHlwZSA9IEdMX0xJTkVTXG4gICAgICBpZiAoZGltZW5zaW9uID09PSAzKSBwcmltVHlwZSA9IEdMX1RSSUFOR0xFU1xuXG4gICAgICAvLyBpZiBtYW51YWwgb3ZlcnJpZGUgcHJlc2VudCwgdXNlIHRoYXRcbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgaWYgKCdwcmltaXRpdmUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB2YXIgcHJpbWl0aXZlID0gb3B0aW9ucy5wcmltaXRpdmVcbiAgICAgICAgICBcbiAgICAgICAgICBwcmltVHlwZSA9IHByaW1UeXBlc1twcmltaXRpdmVdXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2NvdW50JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdmVydENvdW50ID0gb3B0aW9ucy52ZXJ0Q291bnQgfCAwXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gdXBkYXRlIHByb3BlcnRpZXMgZm9yIGVsZW1lbnQgYnVmZmVyXG4gICAgICBlbGVtZW50cy5wcmltVHlwZSA9IHByaW1UeXBlXG4gICAgICBlbGVtZW50cy52ZXJ0Q291bnQgPSB2ZXJ0Q291bnRcbiAgICAgIGVsZW1lbnRzLnR5cGUgPSB0eXBlXG5cbiAgICAgIHJldHVybiByZWdsRWxlbWVudHNcbiAgICB9XG5cbiAgICByZWdsRWxlbWVudHMob3B0aW9ucylcblxuICAgIHJlZ2xFbGVtZW50cy5fcmVnbFR5cGUgPSAnZWxlbWVudHMnXG4gICAgcmVnbEVsZW1lbnRzLl9lbGVtZW50cyA9IGVsZW1lbnRzXG4gICAgcmVnbEVsZW1lbnRzLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7XG4gICAgICBcbiAgICAgIGJ1ZmZlci5kZXN0cm95KClcbiAgICAgIGVsZW1lbnRzLmJ1ZmZlciA9IG51bGxcbiAgICB9XG5cbiAgICByZXR1cm4gcmVnbEVsZW1lbnRzXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNyZWF0ZTogY3JlYXRlRWxlbWVudHMsXG4gICAgZWxlbWVudHM6IGVsZW1lbnRzLFxuICAgIGdldEVsZW1lbnRzOiBmdW5jdGlvbiAoZWxlbWVudHMpIHtcbiAgICAgIGlmIChlbGVtZW50cyAmJiBlbGVtZW50cy5fZWxlbWVudHMgaW5zdGFuY2VvZiBSRUdMRWxlbWVudEJ1ZmZlcikge1xuICAgICAgICByZXR1cm4gZWxlbWVudHMuX2VsZW1lbnRzXG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoYmFzZSwgb3B0cykge1xuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKG9wdHMpXG4gIGZvciAodmFyIGkgPSAwOyBpIDwga2V5cy5sZW5ndGg7ICsraSkge1xuICAgIGJhc2Vba2V5c1tpXV0gPSBvcHRzW2tleXNbaV1dXG4gIH1cbiAgcmV0dXJuIGJhc2Vcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY3JlYXRlRXh0ZW5zaW9uQ2FjaGUgKGdsKSB7XG4gIHZhciBleHRlbnNpb25zID0ge31cblxuICBmdW5jdGlvbiByZWZyZXNoRXh0ZW5zaW9ucyAoKSB7XG4gICAgW1xuICAgICAgJ29lc190ZXh0dXJlX2Zsb2F0JyxcbiAgICAgICdvZXNfdGV4dHVyZV9mbG9hdF9saW5lYXInLFxuICAgICAgJ29lc190ZXh0dXJlX2hhbGZfZmxvYXQnLFxuICAgICAgJ29lc190ZXh0dXJlX2hhbGZfZmxvYXRfbGluZWFyJyxcbiAgICAgICdvZXNfc3RhbmRhcmRfZGVyaXZhdGl2ZXMnLFxuICAgICAgJ29lc19lbGVtZW50X2luZGV4X3VpbnQnLFxuICAgICAgJ29lc19mYm9fcmVuZGVyX21pcG1hcCcsXG5cbiAgICAgICd3ZWJnbF9kZXB0aF90ZXh0dXJlJyxcbiAgICAgICd3ZWJnbF9kcmF3X2J1ZmZlcnMnLFxuICAgICAgJ3dlYmdsX2NvbG9yX2J1ZmZlcl9mbG9hdCcsXG5cbiAgICAgICdleHRfdGV4dHVyZV9maWx0ZXJfYW5pc290cm9waWMnLFxuICAgICAgJ2V4dF9mcmFnX2RlcHRoJyxcbiAgICAgICdleHRfYmxlbmRfbWlubWF4JyxcbiAgICAgICdleHRfc2hhZGVyX3RleHR1cmVfbG9kJyxcbiAgICAgICdleHRfY29sb3JfYnVmZmVyX2hhbGZfZmxvYXQnLFxuICAgICAgJ2V4dF9zcmdiJyxcblxuICAgICAgJ2FuZ2xlX2luc3RhbmNlZF9hcnJheXMnLFxuXG4gICAgICAnd2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX3MzdGMnLFxuICAgICAgJ3dlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9hdGMnLFxuICAgICAgJ3dlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9wdnJ0YycsXG4gICAgICAnd2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX2V0YzEnXG4gICAgXS5mb3JFYWNoKGZ1bmN0aW9uIChleHQpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGV4dGVuc2lvbnNbZXh0XSA9IGdsLmdldEV4dGVuc2lvbihleHQpXG4gICAgICB9IGNhdGNoIChlKSB7fVxuICAgIH0pXG4gIH1cblxuICByZWZyZXNoRXh0ZW5zaW9ucygpXG5cbiAgcmV0dXJuIHtcbiAgICBleHRlbnNpb25zOiBleHRlbnNpb25zLFxuICAgIHJlZnJlc2g6IHJlZnJlc2hFeHRlbnNpb25zXG4gIH1cbn1cbiIsIlxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdmFsdWVzJylcbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL2V4dGVuZCcpXG5cbi8vIFdlIHN0b3JlIHRoZXNlIGNvbnN0YW50cyBzbyB0aGF0IHRoZSBtaW5pZmllciBjYW4gaW5saW5lIHRoZW1cbnZhciBHTF9GUkFNRUJVRkZFUiA9IDB4OEQ0MFxudmFyIEdMX1JFTkRFUkJVRkZFUiA9IDB4OEQ0MVxuXG52YXIgR0xfVEVYVFVSRV8yRCA9IDB4MERFMVxudmFyIEdMX1RFWFRVUkVfQ1VCRV9NQVAgPSAweDg1MTNcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggPSAweDg1MTVcblxudmFyIEdMX0NPTE9SX0FUVEFDSE1FTlQwID0gMHg4Q0UwXG52YXIgR0xfREVQVEhfQVRUQUNITUVOVCA9IDB4OEQwMFxudmFyIEdMX1NURU5DSUxfQVRUQUNITUVOVCA9IDB4OEQyMFxudmFyIEdMX0RFUFRIX1NURU5DSUxfQVRUQUNITUVOVCA9IDB4ODIxQVxuXG52YXIgR0xfVU5TSUdORURfQllURSA9IDB4MTQwMVxudmFyIEdMX0ZMT0FUID0gMHgxNDA2XG5cbnZhciBHTF9IQUxGX0ZMT0FUX09FUyA9IDB4OEQ2MVxuXG52YXIgR0xfQUxQSEEgPSAweDE5MDZcbnZhciBHTF9MVU1JTkFOQ0UgPSAweDE5MDlcbnZhciBHTF9MVU1JTkFOQ0VfQUxQSEEgPSAweDE5MEFcbnZhciBHTF9SR0IgPSAweDE5MDdcbnZhciBHTF9SR0JBID0gMHgxOTA4XG5cbnZhciBHTF9SR0JBNCA9IDB4ODA1NlxudmFyIEdMX1JHQjVfQTEgPSAweDgwNTdcbnZhciBHTF9SR0I1NjUgPSAweDhENjJcbnZhciBHTF9ERVBUSF9DT01QT05FTlQxNiA9IDB4ODFBNVxudmFyIEdMX1NURU5DSUxfSU5ERVg4ID0gMHg4RDQ4XG5cbnZhciBHTF9ERVBUSF9DT01QT05FTlQgPSAweDE5MDJcbnZhciBHTF9ERVBUSF9TVEVOQ0lMID0gMHg4NEY5XG5cbnZhciBHTF9TUkdCOF9BTFBIQThfRVhUID0gMHg4QzQzXG5cbnZhciBHTF9SR0JBMzJGX0VYVCA9IDB4ODgxNFxuXG52YXIgR0xfUkdCQTE2Rl9FWFQgPSAweDg4MUFcbnZhciBHTF9SR0IxNkZfRVhUID0gMHg4ODFCXG5cbnZhciBHTF9GUkFNRUJVRkZFUl9DT01QTEVURSA9IDB4OENENVxudmFyIEdMX0ZSQU1FQlVGRkVSX0lOQ09NUExFVEVfQVRUQUNITUVOVCA9IDB4OENENlxudmFyIEdMX0ZSQU1FQlVGRkVSX0lOQ09NUExFVEVfTUlTU0lOR19BVFRBQ0hNRU5UID0gMHg4Q0Q3XG52YXIgR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9ESU1FTlNJT05TID0gMHg4Q0Q5XG52YXIgR0xfRlJBTUVCVUZGRVJfVU5TVVBQT1JURUQgPSAweDhDRERcblxudmFyIEdMX0JBQ0sgPSAxMDI5XG5cbnZhciBCQUNLX0JVRkZFUiA9IFtHTF9CQUNLXVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBGQk9TdGF0ZSAoXG4gIGdsLFxuICBleHRlbnNpb25zLFxuICBsaW1pdHMsXG4gIHRleHR1cmVTdGF0ZSxcbiAgcmVuZGVyYnVmZmVyU3RhdGUpIHtcbiAgdmFyIHN0YXR1c0NvZGUgPSB7fVxuICBzdGF0dXNDb2RlW0dMX0ZSQU1FQlVGRkVSX0NPTVBMRVRFXSA9ICdjb21wbGV0ZSdcbiAgc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX0FUVEFDSE1FTlRdID0gJ2luY29tcGxldGUgYXR0YWNobWVudCdcbiAgc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX0RJTUVOU0lPTlNdID0gJ2luY29tcGxldGUgZGltZW5zaW9ucydcbiAgc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX01JU1NJTkdfQVRUQUNITUVOVF0gPSAnaW5jb21wbGV0ZSwgbWlzc2luZyBhdHRhY2htZW50J1xuICBzdGF0dXNDb2RlW0dMX0ZSQU1FQlVGRkVSX1VOU1VQUE9SVEVEXSA9ICd1bnN1cHBvcnRlZCdcblxuICB2YXIgY29sb3JUZXh0dXJlRm9ybWF0cyA9IHtcbiAgICAncmdiYSc6IEdMX1JHQkFcbiAgfVxuXG4gIHZhciBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHMgPSB7XG4gICAgJ3JnYmE0JzogR0xfUkdCQTQsXG4gICAgJ3JnYjU2NSc6IEdMX1JHQjU2NSxcbiAgICAncmdiNSBhMSc6IEdMX1JHQjVfQTFcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLmV4dF9zcmdiKSB7XG4gICAgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzWydzcmdiYSddID0gR0xfU1JHQjhfQUxQSEE4X0VYVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMuZXh0X2NvbG9yX2J1ZmZlcl9oYWxmX2Zsb2F0KSB7XG4gICAgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzWydyZ2JhMTZmJ10gPSBHTF9SR0JBMTZGX0VYVFxuICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0c1sncmdiMTZmJ10gPSBHTF9SR0IxNkZfRVhUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb2xvcl9idWZmZXJfZmxvYXQpIHtcbiAgICBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHNbJ3JnYmEzMmYnXSA9IEdMX1JHQkEzMkZfRVhUXG4gIH1cblxuICB2YXIgZGVwdGhSZW5kZXJidWZmZXJGb3JtYXRFbnVtcyA9IFtHTF9ERVBUSF9DT01QT05FTlQxNl1cbiAgdmFyIHN0ZW5jaWxSZW5kZXJidWZmZXJGb3JtYXRFbnVtcyA9IFtHTF9TVEVOQ0lMX0lOREVYOF1cbiAgdmFyIGRlcHRoU3RlbmNpbFJlbmRlcmJ1ZmZlckZvcm1hdEVudW1zID0gW0dMX0RFUFRIX1NURU5DSUxdXG5cbiAgdmFyIGRlcHRoVGV4dHVyZUZvcm1hdEVudW1zID0gW11cbiAgdmFyIHN0ZW5jaWxUZXh0dXJlRm9ybWF0RW51bXMgPSBbXVxuICB2YXIgZGVwdGhTdGVuY2lsVGV4dHVyZUZvcm1hdEVudW1zID0gW11cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9kZXB0aF90ZXh0dXJlKSB7XG4gICAgZGVwdGhUZXh0dXJlRm9ybWF0RW51bXMucHVzaChHTF9ERVBUSF9DT01QT05FTlQpXG4gICAgZGVwdGhTdGVuY2lsVGV4dHVyZUZvcm1hdEVudW1zLnB1c2goR0xfREVQVEhfU1RFTkNJTClcbiAgfVxuXG4gIHZhciBjb2xvckZvcm1hdHMgPSBleHRlbmQoZXh0ZW5kKHt9LFxuICAgIGNvbG9yVGV4dHVyZUZvcm1hdHMpLFxuICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0cylcblxuICB2YXIgY29sb3JUZXh0dXJlRm9ybWF0RW51bXMgPSB2YWx1ZXMoY29sb3JUZXh0dXJlRm9ybWF0cylcbiAgdmFyIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0RW51bXMgPSB2YWx1ZXMoY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzKVxuXG4gIHZhciBoaWdoZXN0UHJlY2lzaW9uID0gR0xfVU5TSUdORURfQllURVxuICB2YXIgY29sb3JUeXBlcyA9IHtcbiAgICAndWludDgnOiBHTF9VTlNJR05FRF9CWVRFXG4gIH1cbiAgaWYgKGV4dGVuc2lvbnMub2VzX3RleHR1cmVfaGFsZl9mbG9hdCkge1xuICAgIGhpZ2hlc3RQcmVjaXNpb24gPSBjb2xvclR5cGVzWydoYWxmIGZsb2F0J10gPSBHTF9IQUxGX0ZMT0FUX09FU1xuICB9XG4gIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2Zsb2F0KSB7XG4gICAgaGlnaGVzdFByZWNpc2lvbiA9IGNvbG9yVHlwZXMuZmxvYXQgPSBHTF9GTE9BVFxuICB9XG4gIGNvbG9yVHlwZXMuYmVzdCA9IGhpZ2hlc3RQcmVjaXNpb25cblxuICB2YXIgRFJBV19CVUZGRVJTID0gKGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgcmVzdWx0ID0gbmV3IEFycmF5KGxpbWl0cy5tYXhEcmF3YnVmZmVycylcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8PSBsaW1pdHMubWF4RHJhd2J1ZmZlcnM7ICsraSkge1xuICAgICAgdmFyIHJvdyA9IHJlc3VsdFtpXSA9IG5ldyBBcnJheShpKVxuICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBpOyArK2opIHtcbiAgICAgICAgcm93W2pdID0gR0xfQ09MT1JfQVRUQUNITUVOVDAgKyBqXG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHRcbiAgfSkoKVxuXG4gIGZ1bmN0aW9uIEZyYW1lYnVmZmVyQXR0YWNobWVudCAodGFyZ2V0LCBsZXZlbCwgdGV4dHVyZSwgcmVuZGVyYnVmZmVyKSB7XG4gICAgdGhpcy50YXJnZXQgPSB0YXJnZXRcbiAgICB0aGlzLmxldmVsID0gbGV2ZWxcbiAgICB0aGlzLnRleHR1cmUgPSB0ZXh0dXJlXG4gICAgdGhpcy5yZW5kZXJidWZmZXIgPSByZW5kZXJidWZmZXJcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlY1JlZiAoYXR0YWNobWVudCkge1xuICAgIGlmIChhdHRhY2htZW50KSB7XG4gICAgICBpZiAoYXR0YWNobWVudC50ZXh0dXJlKSB7XG4gICAgICAgIGF0dGFjaG1lbnQudGV4dHVyZS5fdGV4dHVyZS5kZWNSZWYoKVxuICAgICAgfVxuICAgICAgaWYgKGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyKSB7XG4gICAgICAgIGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIuZGVjUmVmKClcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBjaGVja0Zvcm1hdCAoYXR0YWNobWVudCwgdGV4Rm9ybWF0cywgcmJGb3JtYXRzKSB7XG4gICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgXG4gICAgfSBlbHNlIHtcbiAgICAgIFxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGluY1JlZkFuZENoZWNrU2hhcGUgKGF0dGFjaG1lbnQsIGZyYW1lYnVmZmVyKSB7XG4gICAgdmFyIHdpZHRoID0gZnJhbWVidWZmZXIud2lkdGhcbiAgICB2YXIgaGVpZ2h0ID0gZnJhbWVidWZmZXIuaGVpZ2h0XG4gICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgdmFyIHRleHR1cmUgPSBhdHRhY2htZW50LnRleHR1cmUuX3RleHR1cmVcbiAgICAgIHZhciB0dyA9IE1hdGgubWF4KDEsIHRleHR1cmUucGFyYW1zLndpZHRoID4+IGF0dGFjaG1lbnQubGV2ZWwpXG4gICAgICB2YXIgdGggPSBNYXRoLm1heCgxLCB0ZXh0dXJlLnBhcmFtcy5oZWlnaHQgPj4gYXR0YWNobWVudC5sZXZlbClcbiAgICAgIHdpZHRoID0gd2lkdGggfHwgdHdcbiAgICAgIGhlaWdodCA9IGhlaWdodCB8fCB0aFxuICAgICAgXG4gICAgICBcbiAgICAgIHRleHR1cmUucmVmQ291bnQgKz0gMVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgcmVuZGVyYnVmZmVyID0gYXR0YWNobWVudC5yZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlclxuICAgICAgd2lkdGggPSB3aWR0aCB8fCByZW5kZXJidWZmZXIud2lkdGhcbiAgICAgIGhlaWdodCA9IGhlaWdodCB8fCByZW5kZXJidWZmZXIuaGVpZ2h0XG4gICAgICBcbiAgICAgIFxuICAgICAgcmVuZGVyYnVmZmVyLnJlZkNvdW50ICs9IDFcbiAgICB9XG4gICAgZnJhbWVidWZmZXIud2lkdGggPSB3aWR0aFxuICAgIGZyYW1lYnVmZmVyLmhlaWdodCA9IGhlaWdodFxuICB9XG5cbiAgZnVuY3Rpb24gYXR0YWNoIChsb2NhdGlvbiwgYXR0YWNobWVudCkge1xuICAgIGlmIChhdHRhY2htZW50KSB7XG4gICAgICBpZiAoYXR0YWNobWVudC50ZXh0dXJlKSB7XG4gICAgICAgIGdsLmZyYW1lYnVmZmVyVGV4dHVyZTJEKFxuICAgICAgICAgIEdMX0ZSQU1FQlVGRkVSLFxuICAgICAgICAgIGxvY2F0aW9uLFxuICAgICAgICAgIGF0dGFjaG1lbnQudGFyZ2V0LFxuICAgICAgICAgIGF0dGFjaG1lbnQudGV4dHVyZS5fdGV4dHVyZS50ZXh0dXJlLFxuICAgICAgICAgIGF0dGFjaG1lbnQubGV2ZWwpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBnbC5mcmFtZWJ1ZmZlclJlbmRlcmJ1ZmZlcihcbiAgICAgICAgICBHTF9GUkFNRUJVRkZFUixcbiAgICAgICAgICBsb2NhdGlvbixcbiAgICAgICAgICBHTF9SRU5ERVJCVUZGRVIsXG4gICAgICAgICAgYXR0YWNobWVudC5yZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlci5yZW5kZXJidWZmZXIpXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGdsLmZyYW1lYnVmZmVyVGV4dHVyZTJEKFxuICAgICAgICBHTF9GUkFNRUJVRkZFUixcbiAgICAgICAgbG9jYXRpb24sXG4gICAgICAgIEdMX1RFWFRVUkVfMkQsXG4gICAgICAgIG51bGwsXG4gICAgICAgIDApXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gdHJ5VXBkYXRlQXR0YWNobWVudCAoXG4gICAgYXR0YWNobWVudCxcbiAgICBpc1RleHR1cmUsXG4gICAgZm9ybWF0LFxuICAgIHR5cGUsXG4gICAgd2lkdGgsXG4gICAgaGVpZ2h0KSB7XG4gICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgdmFyIHRleHR1cmUgPSBhdHRhY2htZW50LnRleHR1cmVcbiAgICAgIGlmIChpc1RleHR1cmUpIHtcbiAgICAgICAgdGV4dHVyZSh7XG4gICAgICAgICAgZm9ybWF0OiBmb3JtYXQsXG4gICAgICAgICAgdHlwZTogdHlwZSxcbiAgICAgICAgICB3aWR0aDogd2lkdGgsXG4gICAgICAgICAgaGVpZ2h0OiBoZWlnaHRcbiAgICAgICAgfSlcbiAgICAgICAgdGV4dHVyZS5fdGV4dHVyZS5yZWZDb3VudCArPSAxXG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciByZW5kZXJidWZmZXIgPSBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlclxuICAgICAgaWYgKCFpc1RleHR1cmUpIHtcbiAgICAgICAgcmVuZGVyYnVmZmVyKHtcbiAgICAgICAgICBmb3JtYXQ6IGZvcm1hdCxcbiAgICAgICAgICB3aWR0aDogd2lkdGgsXG4gICAgICAgICAgaGVpZ2h0OiBoZWlnaHRcbiAgICAgICAgfSlcbiAgICAgICAgcmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIucmVmQ291bnQgKz0gMVxuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgfVxuICAgIH1cbiAgICBkZWNSZWYoYXR0YWNobWVudClcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlQXR0YWNobWVudCAoYXR0YWNobWVudCkge1xuICAgIHZhciB0YXJnZXQgPSBHTF9URVhUVVJFXzJEXG4gICAgdmFyIGxldmVsID0gMFxuICAgIHZhciB0ZXh0dXJlID0gbnVsbFxuICAgIHZhciByZW5kZXJidWZmZXIgPSBudWxsXG5cbiAgICB2YXIgZGF0YSA9IGF0dGFjaG1lbnRcbiAgICBpZiAodHlwZW9mIGF0dGFjaG1lbnQgPT09ICdvYmplY3QnKSB7XG4gICAgICBkYXRhID0gYXR0YWNobWVudC5kYXRhXG4gICAgICBpZiAoJ2xldmVsJyBpbiBhdHRhY2htZW50KSB7XG4gICAgICAgIGxldmVsID0gYXR0YWNobWVudC5sZXZlbCB8IDBcbiAgICAgIH1cbiAgICAgIGlmICgndGFyZ2V0JyBpbiBhdHRhY2htZW50KSB7XG4gICAgICAgIHRhcmdldCA9IGF0dGFjaG1lbnQudGFyZ2V0IHwgMFxuICAgICAgfVxuICAgIH1cblxuICAgIFxuXG4gICAgdmFyIHR5cGUgPSBhdHRhY2htZW50Ll9yZWdsVHlwZVxuICAgIGlmICh0eXBlID09PSAndGV4dHVyZScpIHtcbiAgICAgIHRleHR1cmUgPSBhdHRhY2htZW50XG4gICAgICBpZiAodGV4dHVyZS5fdGV4dHVyZS50YXJnZXQgPT09IEdMX1RFWFRVUkVfQ1VCRV9NQVApIHtcbiAgICAgICAgXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcbiAgICAgIH1cbiAgICAgIC8vIFRPRE8gY2hlY2sgbWlwbGV2ZWwgaXMgY29uc2lzdGVudFxuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3JlbmRlcmJ1ZmZlcicpIHtcbiAgICAgIHJlbmRlcmJ1ZmZlciA9IGF0dGFjaG1lbnRcbiAgICAgIHRhcmdldCA9IEdMX1JFTkRFUkJVRkZFUlxuICAgICAgbGV2ZWwgPSAwXG4gICAgfSBlbHNlIHtcbiAgICAgIFxuICAgIH1cblxuICAgIHJldHVybiBuZXcgRnJhbWVidWZmZXJBdHRhY2htZW50KHRhcmdldCwgbGV2ZWwsIHRleHR1cmUsIHJlbmRlcmJ1ZmZlcilcbiAgfVxuXG4gIGZ1bmN0aW9uIHVud3JhcEF0dGFjaG1lbnQgKGF0dGFjaG1lbnQpIHtcbiAgICByZXR1cm4gYXR0YWNobWVudCAmJiAoYXR0YWNobWVudC50ZXh0dXJlIHx8IGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyKVxuICB9XG5cbiAgdmFyIGZyYW1lYnVmZmVyQ291bnQgPSAwXG4gIHZhciBmcmFtZWJ1ZmZlclNldCA9IHt9XG4gIHZhciBmcmFtZWJ1ZmZlclN0YWNrID0gW251bGxdXG4gIHZhciBmcmFtZWJ1ZmZlckRpcnR5ID0gdHJ1ZVxuXG4gIGZ1bmN0aW9uIFJFR0xGcmFtZWJ1ZmZlciAoKSB7XG4gICAgdGhpcy5pZCA9IGZyYW1lYnVmZmVyQ291bnQrK1xuICAgIGZyYW1lYnVmZmVyU2V0W3RoaXMuaWRdID0gdGhpc1xuXG4gICAgdGhpcy5mcmFtZWJ1ZmZlciA9IG51bGxcbiAgICB0aGlzLndpZHRoID0gMFxuICAgIHRoaXMuaGVpZ2h0ID0gMFxuXG4gICAgdGhpcy5jb2xvckF0dGFjaG1lbnRzID0gW11cbiAgICB0aGlzLmRlcHRoQXR0YWNobWVudCA9IG51bGxcbiAgICB0aGlzLnN0ZW5jaWxBdHRhY2htZW50ID0gbnVsbFxuICAgIHRoaXMuZGVwdGhTdGVuY2lsQXR0YWNobWVudCA9IG51bGxcblxuICAgIHRoaXMub3duc0NvbG9yID0gZmFsc2VcbiAgICB0aGlzLm93bnNEZXB0aFN0ZW5jaWwgPSBmYWxzZVxuICB9XG5cbiAgZnVuY3Rpb24gcmVmcmVzaCAoZnJhbWVidWZmZXIpIHtcbiAgICBpZiAoIWdsLmlzRnJhbWVidWZmZXIoZnJhbWVidWZmZXIuZnJhbWVidWZmZXIpKSB7XG4gICAgICBmcmFtZWJ1ZmZlci5mcmFtZWJ1ZmZlciA9IGdsLmNyZWF0ZUZyYW1lYnVmZmVyKClcbiAgICB9XG4gICAgZnJhbWVidWZmZXJEaXJ0eSA9IHRydWVcbiAgICBnbC5iaW5kRnJhbWVidWZmZXIoR0xfRlJBTUVCVUZGRVIsIGZyYW1lYnVmZmVyLmZyYW1lYnVmZmVyKVxuXG4gICAgdmFyIGNvbG9yQXR0YWNobWVudHMgPSBmcmFtZWJ1ZmZlci5jb2xvckF0dGFjaG1lbnRzXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjb2xvckF0dGFjaG1lbnRzLmxlbmd0aDsgKytpKSB7XG4gICAgICBhdHRhY2goR0xfQ09MT1JfQVRUQUNITUVOVDAgKyBpLCBjb2xvckF0dGFjaG1lbnRzW2ldKVxuICAgIH1cbiAgICBmb3IgKGkgPSBjb2xvckF0dGFjaG1lbnRzLmxlbmd0aDsgaSA8IGxpbWl0cy5tYXhDb2xvckF0dGFjaG1lbnRzOyArK2kpIHtcbiAgICAgIGF0dGFjaChHTF9DT0xPUl9BVFRBQ0hNRU5UMCArIGksIG51bGwpXG4gICAgfVxuICAgIGF0dGFjaChHTF9ERVBUSF9BVFRBQ0hNRU5ULCBmcmFtZWJ1ZmZlci5kZXB0aEF0dGFjaG1lbnQpXG4gICAgYXR0YWNoKEdMX1NURU5DSUxfQVRUQUNITUVOVCwgZnJhbWVidWZmZXIuc3RlbmNpbEF0dGFjaG1lbnQpXG4gICAgYXR0YWNoKEdMX0RFUFRIX1NURU5DSUxfQVRUQUNITUVOVCwgZnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsQXR0YWNobWVudClcblxuICAgIGlmIChleHRlbnNpb25zLndlYmdsX2RyYXdfYnVmZmVycykge1xuICAgICAgZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnMuZHJhd0J1ZmZlcnNXRUJHTChcbiAgICAgICAgRFJBV19CVUZGRVJTW2NvbG9yQXR0YWNobWVudHMubGVuZ3RoXSlcbiAgICB9XG5cbiAgICAvLyBDaGVjayBzdGF0dXMgY29kZVxuICAgIHZhciBzdGF0dXMgPSBnbC5jaGVja0ZyYW1lYnVmZmVyU3RhdHVzKEdMX0ZSQU1FQlVGRkVSKVxuICAgIGlmIChzdGF0dXMgIT09IEdMX0ZSQU1FQlVGRkVSX0NPTVBMRVRFKSB7XG4gICAgICBcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBkZWNGQk9SZWZzIChmcmFtZWJ1ZmZlcikge1xuICAgIGZyYW1lYnVmZmVyLmNvbG9yQXR0YWNobWVudHMuZm9yRWFjaChkZWNSZWYpXG4gICAgZGVjUmVmKGZyYW1lYnVmZmVyLmRlcHRoQXR0YWNobWVudClcbiAgICBkZWNSZWYoZnJhbWVidWZmZXIuc3RlbmNpbEF0dGFjaG1lbnQpXG4gICAgZGVjUmVmKGZyYW1lYnVmZmVyLmRlcHRoU3RlbmNpbEF0dGFjaG1lbnQpXG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95IChmcmFtZWJ1ZmZlcikge1xuICAgIHZhciBoYW5kbGUgPSBmcmFtZWJ1ZmZlci5mcmFtZWJ1ZmZlclxuICAgIFxuICAgIGlmIChnbC5pc0ZyYW1lYnVmZmVyKGhhbmRsZSkpIHtcbiAgICAgIGdsLmRlbGV0ZUZyYW1lYnVmZmVyKGhhbmRsZSlcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVGQk8gKG9wdGlvbnMpIHtcbiAgICB2YXIgZnJhbWVidWZmZXIgPSBuZXcgUkVHTEZyYW1lYnVmZmVyKClcblxuICAgIGZ1bmN0aW9uIHJlZ2xGcmFtZWJ1ZmZlciAoaW5wdXQpIHtcbiAgICAgIHZhciBpXG4gICAgICB2YXIgb3B0aW9ucyA9IGlucHV0IHx8IHt9XG5cbiAgICAgIHZhciBleHREcmF3QnVmZmVycyA9IGV4dGVuc2lvbnMud2ViZ2xfZHJhd19idWZmZXJzXG5cbiAgICAgIHZhciB3aWR0aCA9IDBcbiAgICAgIHZhciBoZWlnaHQgPSAwXG4gICAgICBpZiAoJ3NoYXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBzaGFwZSA9IG9wdGlvbnMuc2hhcGVcbiAgICAgICAgXG4gICAgICAgIHdpZHRoID0gc2hhcGVbMF1cbiAgICAgICAgaGVpZ2h0ID0gc2hhcGVbMV1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmICgncmFkaXVzJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgd2lkdGggPSBoZWlnaHQgPSBvcHRpb25zLnJhZGl1c1xuICAgICAgICB9XG4gICAgICAgIGlmICgnd2lkdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB3aWR0aCA9IG9wdGlvbnMud2lkdGhcbiAgICAgICAgfVxuICAgICAgICBpZiAoJ2hlaWdodCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGhlaWdodCA9IG9wdGlvbnMuaGVpZ2h0XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gY29sb3JUeXBlLCBudW1Db2xvcnNcbiAgICAgIHZhciBjb2xvckJ1ZmZlcnMgPSBudWxsXG4gICAgICB2YXIgb3duc0NvbG9yID0gZmFsc2VcbiAgICAgIGlmICgnY29sb3JCdWZmZXJzJyBpbiBvcHRpb25zIHx8ICdjb2xvckJ1ZmZlcicgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgY29sb3JJbnB1dHMgPSBvcHRpb25zLmNvbG9yQnVmZmVycyB8fCBvcHRpb25zLmNvbG9yQnVmZmVyXG4gICAgICAgIGlmICghQXJyYXkuaXNBcnJheShjb2xvcklucHV0cykpIHtcbiAgICAgICAgICBjb2xvcklucHV0cyA9IFtjb2xvcklucHV0c11cbiAgICAgICAgfVxuXG4gICAgICAgIGZyYW1lYnVmZmVyLndpZHRoID0gd2lkdGhcbiAgICAgICAgZnJhbWVidWZmZXIuaGVpZ2h0ID0gaGVpZ2h0XG5cbiAgICAgICAgaWYgKGNvbG9ySW5wdXRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICBcbiAgICAgICAgfVxuICAgICAgICBcblxuICAgICAgICAvLyBXcmFwIGNvbG9yIGF0dGFjaG1lbnRzXG4gICAgICAgIGNvbG9yQnVmZmVycyA9IGNvbG9ySW5wdXRzLm1hcChwYXJzZUF0dGFjaG1lbnQpXG5cbiAgICAgICAgLy8gQ2hlY2sgaGVhZCBub2RlXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvckJ1ZmZlcnMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICB2YXIgY29sb3JBdHRhY2htZW50ID0gY29sb3JCdWZmZXJzW2ldXG4gICAgICAgICAgY2hlY2tGb3JtYXQoXG4gICAgICAgICAgICBjb2xvckF0dGFjaG1lbnQsXG4gICAgICAgICAgICBjb2xvclRleHR1cmVGb3JtYXRFbnVtcyxcbiAgICAgICAgICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0RW51bXMpXG4gICAgICAgICAgaW5jUmVmQW5kQ2hlY2tTaGFwZShcbiAgICAgICAgICAgIGNvbG9yQXR0YWNobWVudCxcbiAgICAgICAgICAgIGZyYW1lYnVmZmVyKVxuICAgICAgICB9XG5cbiAgICAgICAgd2lkdGggPSBmcmFtZWJ1ZmZlci53aWR0aFxuICAgICAgICBoZWlnaHQgPSBmcmFtZWJ1ZmZlci5oZWlnaHRcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBjb2xvclRleHR1cmUgPSB0cnVlXG4gICAgICAgIHZhciBjb2xvckZvcm1hdCA9ICdyZ2JhJ1xuICAgICAgICB2YXIgY29sb3JUeXBlID0gJ3VpbnQ4J1xuICAgICAgICB2YXIgY29sb3JDb3VudCA9IDFcbiAgICAgICAgb3duc0NvbG9yID0gdHJ1ZVxuXG4gICAgICAgIGZyYW1lYnVmZmVyLndpZHRoID0gd2lkdGggfHwgZ2wuZHJhd2luZ0J1ZmZlcldpZHRoXG4gICAgICAgIGZyYW1lYnVmZmVyLmhlaWdodCA9IGhlaWdodCB8fCBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0XG5cbiAgICAgICAgaWYgKCdmb3JtYXQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBjb2xvckZvcm1hdCA9IG9wdGlvbnMuZm9ybWF0XG4gICAgICAgICAgXG4gICAgICAgICAgY29sb3JUZXh0dXJlID0gY29sb3JGb3JtYXQgaW4gY29sb3JUZXh0dXJlRm9ybWF0c1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCd0eXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgXG4gICAgICAgICAgY29sb3JUeXBlID0gb3B0aW9ucy50eXBlXG4gICAgICAgICAgXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2NvbG9yQ291bnQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBjb2xvckNvdW50ID0gb3B0aW9ucy5jb2xvckNvdW50IHwgMFxuICAgICAgICAgIFxuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmV1c2UgY29sb3IgYnVmZmVyIGFycmF5IGlmIHdlIG93biBpdFxuICAgICAgICBpZiAoZnJhbWVidWZmZXIub3duc0NvbG9yKSB7XG4gICAgICAgICAgY29sb3JCdWZmZXJzID0gZnJhbWVidWZmZXIuY29sb3JBdHRhY2htZW50c1xuICAgICAgICAgIHdoaWxlIChjb2xvckJ1ZmZlcnMubGVuZ3RoID4gY29sb3JDb3VudCkge1xuICAgICAgICAgICAgZGVjUmVmKGNvbG9yQnVmZmVycy5wb3AoKSlcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29sb3JCdWZmZXJzID0gW11cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHVwZGF0ZSBidWZmZXJzIGluIHBsYWNlLCByZW1vdmUgaW5jb21wYXRpYmxlIGJ1ZmZlcnNcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGNvbG9yQnVmZmVycy5sZW5ndGg7ICsraSkge1xuICAgICAgICAgIGlmICghdHJ5VXBkYXRlQXR0YWNobWVudChcbiAgICAgICAgICAgICAgY29sb3JCdWZmZXJzW2ldLFxuICAgICAgICAgICAgICBjb2xvclRleHR1cmUsXG4gICAgICAgICAgICAgIGNvbG9yRm9ybWF0LFxuICAgICAgICAgICAgICBjb2xvclR5cGUsXG4gICAgICAgICAgICAgIHdpZHRoLFxuICAgICAgICAgICAgICBoZWlnaHQpKSB7XG4gICAgICAgICAgICBjb2xvckJ1ZmZlcnNbaS0tXSA9IGNvbG9yQnVmZmVyc1tjb2xvckJ1ZmZlcnMubGVuZ3RoIC0gMV1cbiAgICAgICAgICAgIGNvbG9yQnVmZmVycy5wb3AoKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFRoZW4gYXBwZW5kIG5ldyBidWZmZXJzXG4gICAgICAgIHdoaWxlIChjb2xvckJ1ZmZlcnMubGVuZ3RoIDwgY29sb3JDb3VudCkge1xuICAgICAgICAgIGlmIChjb2xvclRleHR1cmUpIHtcbiAgICAgICAgICAgIGNvbG9yQnVmZmVycy5wdXNoKG5ldyBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQoXG4gICAgICAgICAgICAgIEdMX1RFWFRVUkVfMkQsXG4gICAgICAgICAgICAgIDAsXG4gICAgICAgICAgICAgIHRleHR1cmVTdGF0ZS5jcmVhdGUoe1xuICAgICAgICAgICAgICAgIGZvcm1hdDogY29sb3JGb3JtYXQsXG4gICAgICAgICAgICAgICAgdHlwZTogY29sb3JUeXBlLFxuICAgICAgICAgICAgICAgIHdpZHRoOiB3aWR0aCxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IGhlaWdodFxuICAgICAgICAgICAgICB9LCBHTF9URVhUVVJFXzJEKSxcbiAgICAgICAgICAgICAgbnVsbCkpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbG9yQnVmZmVycy5wdXNoKG5ldyBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQoXG4gICAgICAgICAgICAgIEdMX1JFTkRFUkJVRkZFUixcbiAgICAgICAgICAgICAgMCxcbiAgICAgICAgICAgICAgbnVsbCxcbiAgICAgICAgICAgICAgcmVuZGVyYnVmZmVyU3RhdGUuY3JlYXRlKHtcbiAgICAgICAgICAgICAgICBmb3JtYXQ6IGNvbG9yRm9ybWF0LFxuICAgICAgICAgICAgICAgIHdpZHRoOiB3aWR0aCxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IGhlaWdodFxuICAgICAgICAgICAgICB9KSkpXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIFxuXG4gICAgICBmcmFtZWJ1ZmZlci53aWR0aCA9IHdpZHRoXG4gICAgICBmcmFtZWJ1ZmZlci5oZWlnaHQgPSBoZWlnaHRcblxuICAgICAgdmFyIGRlcHRoQnVmZmVyID0gbnVsbFxuICAgICAgdmFyIHN0ZW5jaWxCdWZmZXIgPSBudWxsXG4gICAgICB2YXIgZGVwdGhTdGVuY2lsQnVmZmVyID0gbnVsbFxuICAgICAgdmFyIG93bnNEZXB0aFN0ZW5jaWwgPSBmYWxzZVxuICAgICAgdmFyIGRlcHRoU3RlbmNpbENvdW50ID0gMFxuXG4gICAgICBpZiAoJ2RlcHRoQnVmZmVyJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIGRlcHRoQnVmZmVyID0gcGFyc2VBdHRhY2htZW50KG9wdGlvbnMuZGVwdGhCdWZmZXIpXG4gICAgICAgIGNoZWNrRm9ybWF0KFxuICAgICAgICAgIGRlcHRoQnVmZmVyLFxuICAgICAgICAgIGRlcHRoVGV4dHVyZUZvcm1hdEVudW1zLFxuICAgICAgICAgIGRlcHRoUmVuZGVyYnVmZmVyRm9ybWF0RW51bXMpXG4gICAgICAgIGRlcHRoU3RlbmNpbENvdW50ICs9IDFcbiAgICAgIH1cbiAgICAgIGlmICgnc3RlbmNpbEJ1ZmZlcicgaW4gb3B0aW9ucykge1xuICAgICAgICBzdGVuY2lsQnVmZmVyID0gcGFyc2VBdHRhY2htZW50KG9wdGlvbnMuc3RlbmNpbEJ1ZmZlcilcbiAgICAgICAgY2hlY2tGb3JtYXQoXG4gICAgICAgICAgc3RlbmNpbEJ1ZmZlcixcbiAgICAgICAgICBzdGVuY2lsVGV4dHVyZUZvcm1hdEVudW1zLFxuICAgICAgICAgIHN0ZW5jaWxSZW5kZXJidWZmZXJGb3JtYXRFbnVtcylcbiAgICAgICAgZGVwdGhTdGVuY2lsQ291bnQgKz0gMVxuICAgICAgfVxuICAgICAgaWYgKCdkZXB0aFN0ZW5jaWxCdWZmZXInIGluIG9wdGlvbnMpIHtcbiAgICAgICAgZGVwdGhTdGVuY2lsQnVmZmVyID0gcGFyc2VBdHRhY2htZW50KG9wdGlvbnMuZGVwdGhTdGVuY2lsQnVmZmVyKVxuICAgICAgICBjaGVja0Zvcm1hdChcbiAgICAgICAgICBkZXB0aFN0ZW5jaWxCdWZmZXIsXG4gICAgICAgICAgZGVwdGhTdGVuY2lsVGV4dHVyZUZvcm1hdEVudW1zLFxuICAgICAgICAgIGRlcHRoU3RlbmNpbFJlbmRlcmJ1ZmZlckZvcm1hdEVudW1zKVxuICAgICAgICBkZXB0aFN0ZW5jaWxDb3VudCArPSAxXG4gICAgICB9XG5cbiAgICAgIGlmICghKGRlcHRoQnVmZmVyIHx8IHN0ZW5jaWxCdWZmZXIgfHwgZGVwdGhTdGVuY2lsQnVmZmVyKSkge1xuICAgICAgICB2YXIgZGVwdGggPSB0cnVlXG4gICAgICAgIHZhciBzdGVuY2lsID0gZmFsc2VcbiAgICAgICAgdmFyIHVzZVRleHR1cmUgPSBmYWxzZVxuXG4gICAgICAgIGlmICgnZGVwdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBkZXB0aCA9ICEhb3B0aW9ucy5kZXB0aFxuICAgICAgICB9XG4gICAgICAgIGlmICgnc3RlbmNpbCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHN0ZW5jaWwgPSAhIW9wdGlvbnMuc3RlbmNpbFxuICAgICAgICB9XG4gICAgICAgIGlmICgnZGVwdGhUZXh0dXJlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdXNlVGV4dHVyZSA9ICEhb3B0aW9ucy5kZXB0aFRleHR1cmVcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBjdXJEZXB0aFN0ZW5jaWwgPVxuICAgICAgICAgIGZyYW1lYnVmZmVyLmRlcHRoQXR0YWNobWVudCB8fFxuICAgICAgICAgIGZyYW1lYnVmZmVyLnN0ZW5jaWxBdHRhY2htZW50IHx8XG4gICAgICAgICAgZnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsQXR0YWNobWVudFxuICAgICAgICB2YXIgbmV4dERlcHRoU3RlbmNpbCA9IG51bGxcblxuICAgICAgICBpZiAoZGVwdGggfHwgc3RlbmNpbCkge1xuICAgICAgICAgIG93bnNEZXB0aFN0ZW5jaWwgPSB0cnVlXG5cbiAgICAgICAgICBpZiAodXNlVGV4dHVyZSkge1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB2YXIgZGVwdGhUZXh0dXJlRm9ybWF0XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIChzdGVuY2lsKSB7XG4gICAgICAgICAgICAgIGRlcHRoVGV4dHVyZUZvcm1hdCA9ICdkZXB0aCBzdGVuY2lsJ1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgZGVwdGhUZXh0dXJlRm9ybWF0ID0gJ2RlcHRoJ1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGZyYW1lYnVmZmVyLm93bnNEZXB0aFN0ZW5jaWwgJiYgY3VyRGVwdGhTdGVuY2lsLnRleHR1cmUpIHtcbiAgICAgICAgICAgICAgY3VyRGVwdGhTdGVuY2lsLnRleHR1cmUoe1xuICAgICAgICAgICAgICAgIGZvcm1hdDogZGVwdGhUZXh0dXJlRm9ybWF0LFxuICAgICAgICAgICAgICAgIHdpZHRoOiB3aWR0aCxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IGhlaWdodFxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICBjdXJEZXB0aFN0ZW5jaWwudGV4dHVyZS5fdGV4dHVyZS5yZWZDb3VudCArPSAxXG4gICAgICAgICAgICAgIG5leHREZXB0aFN0ZW5jaWwgPSBjdXJEZXB0aFN0ZW5jaWxcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIG5leHREZXB0aFN0ZW5jaWwgPSBuZXcgRnJhbWVidWZmZXJBdHRhY2htZW50KFxuICAgICAgICAgICAgICAgIEdMX1RFWFRVUkVfMkQsXG4gICAgICAgICAgICAgICAgMCxcbiAgICAgICAgICAgICAgICB0ZXh0dXJlU3RhdGUuY3JlYXRlKHtcbiAgICAgICAgICAgICAgICAgIGZvcm1hdDogZGVwdGhUZXh0dXJlRm9ybWF0LFxuICAgICAgICAgICAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICAgICAgICAgICAgaGVpZ2h0OiBoZWlnaHRcbiAgICAgICAgICAgICAgICB9LCBHTF9URVhUVVJFXzJEKSxcbiAgICAgICAgICAgICAgICBudWxsKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgZGVwdGhSZW5kZXJidWZmZXJGb3JtYXRcbiAgICAgICAgICAgIGlmIChkZXB0aCkge1xuICAgICAgICAgICAgICBpZiAoc3RlbmNpbCkge1xuICAgICAgICAgICAgICAgIGRlcHRoUmVuZGVyYnVmZmVyRm9ybWF0ID0gJ2RlcHRoIHN0ZW5jaWwnXG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZGVwdGhSZW5kZXJidWZmZXJGb3JtYXQgPSAnZGVwdGgnXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGRlcHRoUmVuZGVyYnVmZmVyRm9ybWF0ID0gJ3N0ZW5jaWwnXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZnJhbWVidWZmZXIub3duc0RlcHRoU3RlbmNpbCAmJiBjdXJEZXB0aFN0ZW5jaWwucmVuZGVyYnVmZmVyKSB7XG4gICAgICAgICAgICAgIGN1ckRlcHRoU3RlbmNpbC5yZW5kZXJidWZmZXIoe1xuICAgICAgICAgICAgICAgIGZvcm1hdDogZGVwdGhSZW5kZXJidWZmZXJGb3JtYXQsXG4gICAgICAgICAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICAgICAgICAgIGhlaWdodDogaGVpZ2h0XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIGN1ckRlcHRoU3RlbmNpbC5yZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlci5yZWZDb3VudCArPSAxXG4gICAgICAgICAgICAgIG5leHREZXB0aFN0ZW5jaWwgPSBjdXJEZXB0aFN0ZW5jaWxcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIG5leHREZXB0aFN0ZW5jaWwgPSBuZXcgRnJhbWVidWZmZXJBdHRhY2htZW50KFxuICAgICAgICAgICAgICAgIEdMX1JFTkRFUkJVRkZFUixcbiAgICAgICAgICAgICAgICAwLFxuICAgICAgICAgICAgICAgIG51bGwsXG4gICAgICAgICAgICAgICAgcmVuZGVyYnVmZmVyU3RhdGUuY3JlYXRlKHtcbiAgICAgICAgICAgICAgICAgIGZvcm1hdDogZGVwdGhSZW5kZXJidWZmZXJGb3JtYXQsXG4gICAgICAgICAgICAgICAgICB3aWR0aDogd2lkdGgsXG4gICAgICAgICAgICAgICAgICBoZWlnaHQ6IGhlaWdodFxuICAgICAgICAgICAgICAgIH0pKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChkZXB0aCkge1xuICAgICAgICAgICAgaWYgKHN0ZW5jaWwpIHtcbiAgICAgICAgICAgICAgZGVwdGhTdGVuY2lsQnVmZmVyID0gbmV4dERlcHRoU3RlbmNpbFxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgZGVwdGhCdWZmZXIgPSBuZXh0RGVwdGhTdGVuY2lsXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN0ZW5jaWxCdWZmZXIgPSBuZXh0RGVwdGhTdGVuY2lsXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcblxuICAgICAgICBpbmNSZWZBbmRDaGVja1NoYXBlKFxuICAgICAgICAgIGRlcHRoQnVmZmVyIHx8XG4gICAgICAgICAgc3RlbmNpbEJ1ZmZlciB8fFxuICAgICAgICAgIGRlcHRoU3RlbmNpbEJ1ZmZlcixcbiAgICAgICAgICBmcmFtZWJ1ZmZlcilcbiAgICAgIH1cblxuICAgICAgZGVjRkJPUmVmcyhmcmFtZWJ1ZmZlcilcblxuICAgICAgZnJhbWVidWZmZXIuY29sb3JBdHRhY2htZW50cyA9IGNvbG9yQnVmZmVyc1xuICAgICAgZnJhbWVidWZmZXIuZGVwdGhBdHRhY2htZW50ID0gZGVwdGhCdWZmZXJcbiAgICAgIGZyYW1lYnVmZmVyLnN0ZW5jaWxBdHRhY2htZW50ID0gc3RlbmNpbEJ1ZmZlclxuICAgICAgZnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsQXR0YWNobWVudCA9IGRlcHRoU3RlbmNpbEJ1ZmZlclxuICAgICAgZnJhbWVidWZmZXIub3duc0NvbG9yID0gb3duc0NvbG9yXG4gICAgICBmcmFtZWJ1ZmZlci5vd25zRGVwdGhTdGVuY2lsID0gb3duc0RlcHRoU3RlbmNpbFxuXG4gICAgICByZWdsRnJhbWVidWZmZXIuY29sb3IgPSBjb2xvckJ1ZmZlcnMubWFwKHVud3JhcEF0dGFjaG1lbnQpXG4gICAgICByZWdsRnJhbWVidWZmZXIuZGVwdGggPSB1bndyYXBBdHRhY2htZW50KGRlcHRoQnVmZmVyKVxuICAgICAgcmVnbEZyYW1lYnVmZmVyLnN0ZW5jaWwgPSB1bndyYXBBdHRhY2htZW50KHN0ZW5jaWxCdWZmZXIpXG4gICAgICByZWdsRnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsID0gdW53cmFwQXR0YWNobWVudChkZXB0aFN0ZW5jaWxCdWZmZXIpXG5cbiAgICAgIHJlZnJlc2goZnJhbWVidWZmZXIpXG5cbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci53aWR0aCA9IGZyYW1lYnVmZmVyLndpZHRoXG4gICAgICByZWdsRnJhbWVidWZmZXIuaGVpZ2h0ID0gZnJhbWVidWZmZXIuaGVpZ2h0XG5cbiAgICAgIHJldHVybiByZWdsRnJhbWVidWZmZXJcbiAgICB9XG5cbiAgICByZWdsRnJhbWVidWZmZXIob3B0aW9ucylcblxuICAgIHJlZ2xGcmFtZWJ1ZmZlci5fcmVnbFR5cGUgPSAnZnJhbWVidWZmZXInXG4gICAgcmVnbEZyYW1lYnVmZmVyLl9mcmFtZWJ1ZmZlciA9IGZyYW1lYnVmZmVyXG4gICAgcmVnbEZyYW1lYnVmZmVyLl9kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICAgICAgZGVzdHJveShmcmFtZWJ1ZmZlcilcbiAgICB9XG5cbiAgICByZXR1cm4gcmVnbEZyYW1lYnVmZmVyXG4gIH1cblxuICBmdW5jdGlvbiByZWZyZXNoQ2FjaGUgKCkge1xuICAgIHZhbHVlcyhmcmFtZWJ1ZmZlclNldCkuZm9yRWFjaChyZWZyZXNoKVxuICB9XG5cbiAgZnVuY3Rpb24gY2xlYXJDYWNoZSAoKSB7XG4gICAgdmFsdWVzKGZyYW1lYnVmZmVyU2V0KS5mb3JFYWNoKGRlc3Ryb3kpXG4gIH1cblxuICBmdW5jdGlvbiBwb2xsICgpIHtcbiAgICBpZiAoZnJhbWVidWZmZXJEaXJ0eSkge1xuICAgICAgdmFyIHRvcCA9IGZyYW1lYnVmZmVyU3RhY2tbZnJhbWVidWZmZXJTdGFjay5sZW5ndGggLSAxXVxuICAgICAgdmFyIGV4dF9kcmF3YnVmZmVycyA9IGV4dGVuc2lvbnMud2ViZ2xfZHJhd19idWZmZXJzXG5cbiAgICAgIGlmICh0b3ApIHtcbiAgICAgICAgZ2wuYmluZEZyYW1lYnVmZmVyKEdMX0ZSQU1FQlVGRkVSLCB0b3AuZnJhbWVidWZmZXIpXG4gICAgICAgIGlmIChleHRfZHJhd2J1ZmZlcnMpIHtcbiAgICAgICAgICBleHRfZHJhd2J1ZmZlcnMuZHJhd0J1ZmZlcnNXRUJHTChEUkFXX0JVRkZFUlNbdG9wLmNvbG9yQXR0YWNobWVudHMubGVuZ3RoXSlcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZ2wuYmluZEZyYW1lYnVmZmVyKEdMX0ZSQU1FQlVGRkVSLCBudWxsKVxuICAgICAgICBpZiAoZXh0X2RyYXdidWZmZXJzKSB7XG4gICAgICAgICAgZXh0X2RyYXdidWZmZXJzLmRyYXdCdWZmZXJzV0VCR0woQkFDS19CVUZGRVIpXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgZnJhbWVidWZmZXJEaXJ0eSA9IGZhbHNlXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gY3VycmVudEZyYW1lYnVmZmVyICgpIHtcbiAgICByZXR1cm4gZnJhbWVidWZmZXJTdGFja1tmcmFtZWJ1ZmZlclN0YWNrLmxlbmd0aCAtIDFdXG4gIH1cblxuICByZXR1cm4ge1xuICAgIHRvcDogY3VycmVudEZyYW1lYnVmZmVyLFxuICAgIGRpcnR5OiBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gZnJhbWVidWZmZXJEaXJ0eVxuICAgIH0sXG4gICAgcHVzaDogZnVuY3Rpb24gKG5leHRfKSB7XG4gICAgICB2YXIgbmV4dCA9IG5leHRfIHx8IG51bGxcbiAgICAgIGZyYW1lYnVmZmVyRGlydHkgPSBmcmFtZWJ1ZmZlckRpcnR5IHx8IChuZXh0ICE9PSBjdXJyZW50RnJhbWVidWZmZXIoKSlcbiAgICAgIGZyYW1lYnVmZmVyU3RhY2sucHVzaChuZXh0KVxuICAgICAgcmV0dXJuIGZyYW1lYnVmZmVyRGlydHlcbiAgICB9LFxuICAgIHBvcDogZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIHByZXYgPSBjdXJyZW50RnJhbWVidWZmZXIoKVxuICAgICAgZnJhbWVidWZmZXJTdGFjay5wb3AoKVxuICAgICAgZnJhbWVidWZmZXJEaXJ0eSA9IGZyYW1lYnVmZmVyRGlydHkgfHwgKHByZXYgIT09IGN1cnJlbnRGcmFtZWJ1ZmZlcigpKVxuICAgICAgcmV0dXJuIGZyYW1lYnVmZmVyRGlydHlcbiAgICB9LFxuICAgIGdldEZyYW1lYnVmZmVyOiBmdW5jdGlvbiAob2JqZWN0KSB7XG4gICAgICBpZiAodHlwZW9mIG9iamVjdCA9PT0gJ2Z1bmN0aW9uJyAmJiBvYmplY3QuX3JlZ2xUeXBlID09PSAnZnJhbWVidWZmZXInKSB7XG4gICAgICAgIHZhciBmYm8gPSBvYmplY3QuX2ZyYW1lYnVmZmVyXG4gICAgICAgIGlmIChmYm8gaW5zdGFuY2VvZiBSRUdMRnJhbWVidWZmZXIpIHtcbiAgICAgICAgICByZXR1cm4gZmJvXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfSxcbiAgICBwb2xsOiBwb2xsLFxuICAgIGNyZWF0ZTogY3JlYXRlRkJPLFxuICAgIGNsZWFyOiBjbGVhckNhY2hlLFxuICAgIHJlZnJlc2g6IHJlZnJlc2hDYWNoZVxuICB9XG59XG4iLCJ2YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi9pcy10eXBlZC1hcnJheScpXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaXNOREFycmF5TGlrZSAob2JqKSB7XG4gIHJldHVybiAoXG4gICAgdHlwZW9mIG9iaiA9PT0gJ29iamVjdCcgJiZcbiAgICBBcnJheS5pc0FycmF5KG9iai5zaGFwZSkgJiZcbiAgICBBcnJheS5pc0FycmF5KG9iai5zdHJpZGUpICYmXG4gICAgdHlwZW9mIG9iai5vZmZzZXQgPT09ICdudW1iZXInICYmXG4gICAgb2JqLnNoYXBlLmxlbmd0aCA9PT0gb2JqLnN0cmlkZS5sZW5ndGggJiZcbiAgICAoQXJyYXkuaXNBcnJheShvYmouZGF0YSkgfHxcbiAgICAgIGlzVHlwZWRBcnJheShvYmouZGF0YSkpKVxufVxuIiwidmFyIGR0eXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL2FycmF5dHlwZXMuanNvbicpXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICh4KSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoeCkgaW4gZHR5cGVzXG59XG4iLCJ2YXIgR0xfU1VCUElYRUxfQklUUyA9IDB4MEQ1MFxudmFyIEdMX1JFRF9CSVRTID0gMHgwRDUyXG52YXIgR0xfR1JFRU5fQklUUyA9IDB4MEQ1M1xudmFyIEdMX0JMVUVfQklUUyA9IDB4MEQ1NFxudmFyIEdMX0FMUEhBX0JJVFMgPSAweDBENTVcbnZhciBHTF9ERVBUSF9CSVRTID0gMHgwRDU2XG52YXIgR0xfU1RFTkNJTF9CSVRTID0gMHgwRDU3XG5cbnZhciBHTF9BTElBU0VEX1BPSU5UX1NJWkVfUkFOR0UgPSAweDg0NkRcbnZhciBHTF9BTElBU0VEX0xJTkVfV0lEVEhfUkFOR0UgPSAweDg0NkVcblxudmFyIEdMX01BWF9URVhUVVJFX1NJWkUgPSAweDBEMzNcbnZhciBHTF9NQVhfVklFV1BPUlRfRElNUyA9IDB4MEQzQVxudmFyIEdMX01BWF9WRVJURVhfQVRUUklCUyA9IDB4ODg2OVxudmFyIEdMX01BWF9WRVJURVhfVU5JRk9STV9WRUNUT1JTID0gMHg4REZCXG52YXIgR0xfTUFYX1ZBUllJTkdfVkVDVE9SUyA9IDB4OERGQ1xudmFyIEdMX01BWF9DT01CSU5FRF9URVhUVVJFX0lNQUdFX1VOSVRTID0gMHg4QjREXG52YXIgR0xfTUFYX1ZFUlRFWF9URVhUVVJFX0lNQUdFX1VOSVRTID0gMHg4QjRDXG52YXIgR0xfTUFYX1RFWFRVUkVfSU1BR0VfVU5JVFMgPSAweDg4NzJcbnZhciBHTF9NQVhfRlJBR01FTlRfVU5JRk9STV9WRUNUT1JTID0gMHg4REZEXG52YXIgR0xfTUFYX0NVQkVfTUFQX1RFWFRVUkVfU0laRSA9IDB4ODUxQ1xudmFyIEdMX01BWF9SRU5ERVJCVUZGRVJfU0laRSA9IDB4ODRFOFxuXG52YXIgR0xfVkVORE9SID0gMHgxRjAwXG52YXIgR0xfUkVOREVSRVIgPSAweDFGMDFcbnZhciBHTF9WRVJTSU9OID0gMHgxRjAyXG52YXIgR0xfU0hBRElOR19MQU5HVUFHRV9WRVJTSU9OID0gMHg4QjhDXG5cbnZhciBHTF9NQVhfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQgPSAweDg0RkZcblxudmFyIEdMX01BWF9DT0xPUl9BVFRBQ0hNRU5UU19XRUJHTCA9IDB4OENERlxudmFyIEdMX01BWF9EUkFXX0JVRkZFUlNfV0VCR0wgPSAweDg4MjRcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoZ2wsIGV4dGVuc2lvbnMpIHtcbiAgdmFyIG1heEFuaXNvdHJvcGljID0gMVxuICBpZiAoZXh0ZW5zaW9ucy5leHRfdGV4dHVyZV9maWx0ZXJfYW5pc290cm9waWMpIHtcbiAgICBtYXhBbmlzb3Ryb3BpYyA9IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQpXG4gIH1cblxuICB2YXIgbWF4RHJhd2J1ZmZlcnMgPSAxXG4gIHZhciBtYXhDb2xvckF0dGFjaG1lbnRzID0gMVxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnMpIHtcbiAgICBtYXhEcmF3YnVmZmVycyA9IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfRFJBV19CVUZGRVJTX1dFQkdMKVxuICAgIG1heENvbG9yQXR0YWNobWVudHMgPSBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NPTE9SX0FUVEFDSE1FTlRTX1dFQkdMKVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICAvLyBkcmF3aW5nIGJ1ZmZlciBiaXQgZGVwdGhcbiAgICBjb2xvckJpdHM6IFtcbiAgICAgIGdsLmdldFBhcmFtZXRlcihHTF9SRURfQklUUyksXG4gICAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfR1JFRU5fQklUUyksXG4gICAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfQkxVRV9CSVRTKSxcbiAgICAgIGdsLmdldFBhcmFtZXRlcihHTF9BTFBIQV9CSVRTKVxuICAgIF0sXG4gICAgZGVwdGhCaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfREVQVEhfQklUUyksXG4gICAgc3RlbmNpbEJpdHM6IGdsLmdldFBhcmFtZXRlcihHTF9TVEVOQ0lMX0JJVFMpLFxuICAgIHN1YnBpeGVsQml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX1NVQlBJWEVMX0JJVFMpLFxuXG4gICAgLy8gc3VwcG9ydGVkIGV4dGVuc2lvbnNcbiAgICBleHRlbnNpb25zOiBPYmplY3Qua2V5cyhleHRlbnNpb25zKS5maWx0ZXIoZnVuY3Rpb24gKGV4dCkge1xuICAgICAgcmV0dXJuICEhZXh0ZW5zaW9uc1tleHRdXG4gICAgfSksXG5cbiAgICAvLyBtYXggYW5pc28gc2FtcGxlc1xuICAgIG1heEFuaXNvdHJvcGljOiBtYXhBbmlzb3Ryb3BpYyxcblxuICAgIC8vIG1heCBkcmF3IGJ1ZmZlcnNcbiAgICBtYXhEcmF3YnVmZmVyczogbWF4RHJhd2J1ZmZlcnMsXG4gICAgbWF4Q29sb3JBdHRhY2htZW50czogbWF4Q29sb3JBdHRhY2htZW50cyxcblxuICAgIC8vIHBvaW50IGFuZCBsaW5lIHNpemUgcmFuZ2VzXG4gICAgcG9pbnRTaXplRGltczogZ2wuZ2V0UGFyYW1ldGVyKEdMX0FMSUFTRURfUE9JTlRfU0laRV9SQU5HRSksXG4gICAgbGluZVdpZHRoRGltczogZ2wuZ2V0UGFyYW1ldGVyKEdMX0FMSUFTRURfTElORV9XSURUSF9SQU5HRSksXG4gICAgbWF4Vmlld3BvcnREaW1zOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZJRVdQT1JUX0RJTVMpLFxuICAgIG1heENvbWJpbmVkVGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NPTUJJTkVEX1RFWFRVUkVfSU1BR0VfVU5JVFMpLFxuICAgIG1heEN1YmVNYXBTaXplOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NVQkVfTUFQX1RFWFRVUkVfU0laRSksXG4gICAgbWF4UmVuZGVyYnVmZmVyU2l6ZTogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9SRU5ERVJCVUZGRVJfU0laRSksXG4gICAgbWF4VGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1RFWFRVUkVfSU1BR0VfVU5JVFMpLFxuICAgIG1heFRleHR1cmVTaXplOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1RFWFRVUkVfU0laRSksXG4gICAgbWF4QXR0cmlidXRlczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WRVJURVhfQVRUUklCUyksXG4gICAgbWF4VmVydGV4VW5pZm9ybXM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVkVSVEVYX1VOSUZPUk1fVkVDVE9SUyksXG4gICAgbWF4VmVydGV4VGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZFUlRFWF9URVhUVVJFX0lNQUdFX1VOSVRTKSxcbiAgICBtYXhWYXJ5aW5nVmVjdG9yczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WQVJZSU5HX1ZFQ1RPUlMpLFxuICAgIG1heEZyYWdtZW50VW5pZm9ybXM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfRlJBR01FTlRfVU5JRk9STV9WRUNUT1JTKSxcblxuICAgIC8vIHZlbmRvciBpbmZvXG4gICAgZ2xzbDogZ2wuZ2V0UGFyYW1ldGVyKEdMX1NIQURJTkdfTEFOR1VBR0VfVkVSU0lPTiksXG4gICAgcmVuZGVyZXI6IGdsLmdldFBhcmFtZXRlcihHTF9SRU5ERVJFUiksXG4gICAgdmVuZG9yOiBnbC5nZXRQYXJhbWV0ZXIoR0xfVkVORE9SKSxcbiAgICB2ZXJzaW9uOiBnbC5nZXRQYXJhbWV0ZXIoR0xfVkVSU0lPTilcbiAgfVxufVxuIiwiLyogZ2xvYmFscyBkb2N1bWVudCwgSW1hZ2UsIFhNTEh0dHBSZXF1ZXN0ICovXG5cbm1vZHVsZS5leHBvcnRzID0gbG9hZFRleHR1cmVcblxuZnVuY3Rpb24gZ2V0RXh0ZW5zaW9uICh1cmwpIHtcbiAgdmFyIHBhcnRzID0gL1xcLihcXHcrKShcXD8uKik/JC8uZXhlYyh1cmwpXG4gIGlmIChwYXJ0cyAmJiBwYXJ0c1sxXSkge1xuICAgIHJldHVybiBwYXJ0c1sxXS50b0xvd2VyQ2FzZSgpXG4gIH1cbn1cblxuZnVuY3Rpb24gaXNWaWRlb0V4dGVuc2lvbiAodXJsKSB7XG4gIHJldHVybiBbXG4gICAgJ2F2aScsXG4gICAgJ2FzZicsXG4gICAgJ2dpZnYnLFxuICAgICdtb3YnLFxuICAgICdxdCcsXG4gICAgJ3l1dicsXG4gICAgJ21wZycsXG4gICAgJ21wZWcnLFxuICAgICdtMnYnLFxuICAgICdtcDQnLFxuICAgICdtNHAnLFxuICAgICdtNHYnLFxuICAgICdvZ2cnLFxuICAgICdvZ3YnLFxuICAgICd2b2InLFxuICAgICd3ZWJtJyxcbiAgICAnd212J1xuICBdLmluZGV4T2YodXJsKSA+PSAwXG59XG5cbmZ1bmN0aW9uIGlzQ29tcHJlc3NlZEV4dGVuc2lvbiAodXJsKSB7XG4gIHJldHVybiBbXG4gICAgJ2RkcydcbiAgXS5pbmRleE9mKHVybCkgPj0gMFxufVxuXG5mdW5jdGlvbiBsb2FkVmlkZW8gKHVybCwgY3Jvc3NPcmlnaW4pIHtcbiAgdmFyIHZpZGVvID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndmlkZW8nKVxuICB2aWRlby5hdXRvcGxheSA9IHRydWVcbiAgdmlkZW8ubG9vcCA9IHRydWVcbiAgaWYgKGNyb3NzT3JpZ2luKSB7XG4gICAgdmlkZW8uY3Jvc3NPcmlnaW4gPSBjcm9zc09yaWdpblxuICB9XG4gIHZpZGVvLnNyYyA9IHVybFxuICByZXR1cm4gdmlkZW9cbn1cblxuZnVuY3Rpb24gbG9hZENvbXByZXNzZWRUZXh0dXJlICh1cmwsIGV4dCwgY3Jvc3NPcmlnaW4pIHtcbiAgdmFyIHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpXG4gIHhoci5yZXNwb25zZVR5cGUgPSAnYXJyYXlidWZmZXInXG4gIHhoci5vcGVuKCdHRVQnLCB1cmwsIHRydWUpXG4gIHhoci5zZW5kKClcbiAgcmV0dXJuIHhoclxufVxuXG5mdW5jdGlvbiBsb2FkSW1hZ2UgKHVybCwgY3Jvc3NPcmlnaW4pIHtcbiAgdmFyIGltYWdlID0gbmV3IEltYWdlKClcbiAgaWYgKGNyb3NzT3JpZ2luKSB7XG4gICAgaW1hZ2UuY3Jvc3NPcmlnaW4gPSBjcm9zc09yaWdpblxuICB9XG4gIGltYWdlLnNyYyA9IHVybFxuICByZXR1cm4gaW1hZ2Vcbn1cblxuLy8gQ3VycmVudGx5IHRoaXMgc3R1ZmYgb25seSB3b3JrcyBpbiBhIERPTSBlbnZpcm9ubWVudFxuZnVuY3Rpb24gbG9hZFRleHR1cmUgKHVybCwgY3Jvc3NPcmlnaW4pIHtcbiAgaWYgKHR5cGVvZiBkb2N1bWVudCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICB2YXIgZXh0ID0gZ2V0RXh0ZW5zaW9uKHVybClcbiAgICBpZiAoaXNWaWRlb0V4dGVuc2lvbihleHQpKSB7XG4gICAgICByZXR1cm4gbG9hZFZpZGVvKHVybCwgY3Jvc3NPcmlnaW4pXG4gICAgfVxuICAgIGlmIChpc0NvbXByZXNzZWRFeHRlbnNpb24oZXh0KSkge1xuICAgICAgcmV0dXJuIGxvYWRDb21wcmVzc2VkVGV4dHVyZSh1cmwsIGV4dCwgY3Jvc3NPcmlnaW4pXG4gICAgfVxuICAgIHJldHVybiBsb2FkSW1hZ2UodXJsLCBjcm9zc09yaWdpbilcbiAgfVxuICByZXR1cm4gbnVsbFxufVxuIiwiLy8gUmVmZXJlbmNlczpcbi8vXG4vLyBodHRwOi8vbXNkbi5taWNyb3NvZnQuY29tL2VuLXVzL2xpYnJhcnkvYmI5NDM5OTEuYXNweC9cbi8vIGh0dHA6Ly9ibG9nLnRvamljb2RlLmNvbS8yMDExLzEyL2NvbXByZXNzZWQtdGV4dHVyZXMtaW4td2ViZ2wuaHRtbFxuLy9cblxuXG5tb2R1bGUuZXhwb3J0cyA9IHBhcnNlRERTXG5cbnZhciBERFNfTUFHSUMgPSAweDIwNTM0NDQ0XG5cbnZhciBHTF9URVhUVVJFXzJEID0gMHgwREUxXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YID0gMHg4NTE1XG5cbnZhciBHTF9DT01QUkVTU0VEX1JHQl9TM1RDX0RYVDFfRVhUID0gMHg4M0YwXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUMV9FWFQgPSAweDgzRjFcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQzX0VYVCA9IDB4ODNGMlxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDVfRVhUID0gMHg4M0YzXG5cbnZhciBHTF9DT01QUkVTU0VEX1JHQl9FVEMxX1dFQkdMID0gMHg4RDY0XG5cbnZhciBHTF9VTlNJR05FRF9CWVRFID0gMHgxNDAxXG4vLyB2YXIgR0xfSEFMRl9GTE9BVF9PRVMgPSAweDhENjFcbi8vIHZhciBHTF9GTE9BVCA9IDB4MTQwNlxuXG52YXIgRERTRF9NSVBNQVBDT1VOVCA9IDB4MjAwMDBcblxudmFyIEREU0NBUFMyX0NVQkVNQVAgPSAweDIwMFxudmFyIEREU0NBUFMyX0NVQkVNQVBfUE9TSVRJVkVYID0gMHg0MDBcbnZhciBERFNDQVBTMl9DVUJFTUFQX05FR0FUSVZFWCA9IDB4ODAwXG52YXIgRERTQ0FQUzJfQ1VCRU1BUF9QT1NJVElWRVkgPSAweDEwMDBcbnZhciBERFNDQVBTMl9DVUJFTUFQX05FR0FUSVZFWSA9IDB4MjAwMFxudmFyIEREU0NBUFMyX0NVQkVNQVBfUE9TSVRJVkVaID0gMHg0MDAwXG52YXIgRERTQ0FQUzJfQ1VCRU1BUF9ORUdBVElWRVogPSAweDgwMDBcblxudmFyIENVQkVNQVBfQ09NUExFVEVfRkFDRVMgPSAoXG4gIEREU0NBUFMyX0NVQkVNQVBfUE9TSVRJVkVYIHxcbiAgRERTQ0FQUzJfQ1VCRU1BUF9ORUdBVElWRVggfFxuICBERFNDQVBTMl9DVUJFTUFQX1BPU0lUSVZFWSB8XG4gIEREU0NBUFMyX0NVQkVNQVBfTkVHQVRJVkVZIHxcbiAgRERTQ0FQUzJfQ1VCRU1BUF9QT1NJVElWRVogfFxuICBERFNDQVBTMl9DVUJFTUFQX05FR0FUSVZFWilcblxudmFyIEREUEZfRk9VUkNDID0gMHg0XG52YXIgRERQRl9SR0IgPSAweDQwXG5cbnZhciBGT1VSQ0NfRFhUMSA9IDB4MzE1NDU4NDRcbnZhciBGT1VSQ0NfRFhUMyA9IDB4MzM1NDU4NDRcbnZhciBGT1VSQ0NfRFhUNSA9IDB4MzU1NDU4NDRcbnZhciBGT1VSQ0NfRVRDMSA9IDB4MzE0MzU0NDVcblxuLy8gRERTX0hFQURFUiB7XG52YXIgT0ZGX1NJWkUgPSAxICAgICAgICAvLyBpbnQzMiBkd1NpemVcbnZhciBPRkZfRkxBR1MgPSAyICAgICAgIC8vIGludDMyIGR3RmxhZ3NcbnZhciBPRkZfSEVJR0hUID0gMyAgICAgIC8vIGludDMyIGR3SGVpZ2h0XG52YXIgT0ZGX1dJRFRIID0gNCAgICAgICAvLyBpbnQzMiBkd1dpZHRoXG4vLyB2YXIgT0ZGX1BJVENIID0gNSAgICAgICAvLyBpbnQzMiBkd1BpdGNoT3JMaW5lYXJTaXplXG4vLyB2YXIgT0ZGX0RFUFRIID0gNiAgICAgICAvLyBpbnQzMiBkd0RlcHRoXG52YXIgT0ZGX01JUE1BUCA9IDcgICAgICAvLyBpbnQzMiBkd01pcE1hcENvdW50OyAvLyBvZmZzZXQ6IDdcbi8vIGludDMyWzExXSBkd1Jlc2VydmVkMVxuLy8gRERTX1BJWEVMRk9STUFUIHtcbi8vIHZhciBPRkZfUEZfU0laRSA9IDE5ICAgIC8vIGludDMyIGR3U2l6ZTsgLy8gb2Zmc2V0OiAxOVxudmFyIE9GRl9QRl9GTEFHUyA9IDIwICAgLy8gaW50MzIgZHdGbGFnc1xudmFyIE9GRl9GT1VSQ0MgPSAyMSAgICAgLy8gY2hhcls0XSBkd0ZvdXJDQ1xuLy8gdmFyIE9GRl9SR0JBX0JJVFMgPSAyMiAgLy8gaW50MzIgZHdSR0JCaXRDb3VudFxuLy8gdmFyIE9GRl9SRURfTUFTSyA9IDIzICAgLy8gaW50MzIgZHdSQml0TWFza1xuLy8gdmFyIE9GRl9HUkVFTl9NQVNLID0gMjQgLy8gaW50MzIgZHdHQml0TWFza1xuLy8gdmFyIE9GRl9CTFVFX01BU0sgPSAyNSAgLy8gaW50MzIgZHdCQml0TWFza1xuLy8gdmFyIE9GRl9BTFBIQV9NQVNLID0gMjYgLy8gaW50MzIgZHdBQml0TWFzazsgLy8gb2Zmc2V0OiAyNlxuLy8gfVxuLy8gdmFyIE9GRl9DQVBTID0gMjcgICAgICAgLy8gaW50MzIgZHdDYXBzOyAvLyBvZmZzZXQ6IDI3XG52YXIgT0ZGX0NBUFMyID0gMjggICAgICAvLyBpbnQzMiBkd0NhcHMyXG4vLyB2YXIgT0ZGX0NBUFMzID0gMjkgICAgICAvLyBpbnQzMiBkd0NhcHMzXG4vLyB2YXIgT0ZGX0NBUFM0ID0gMzAgICAgICAvLyBpbnQzMiBkd0NhcHM0XG4vLyBpbnQzMiBkd1Jlc2VydmVkMiAvLyBvZmZzZXQgMzFcblxuZnVuY3Rpb24gcGFyc2VERFMgKGFycmF5QnVmZmVyKSB7XG4gIHZhciBoZWFkZXIgPSBuZXcgSW50MzJBcnJheShhcnJheUJ1ZmZlcilcbiAgXG5cbiAgdmFyIGZsYWdzID0gaGVhZGVyW09GRl9GTEFHU11cbiAgXG5cbiAgdmFyIHdpZHRoID0gaGVhZGVyW09GRl9XSURUSF1cbiAgdmFyIGhlaWdodCA9IGhlYWRlcltPRkZfSEVJR0hUXVxuXG4gIHZhciB0eXBlID0gR0xfVU5TSUdORURfQllURVxuICB2YXIgZm9ybWF0ID0gMFxuICB2YXIgYmxvY2tCeXRlcyA9IDBcbiAgdmFyIGNoYW5uZWxzID0gNFxuICBzd2l0Y2ggKGhlYWRlcltPRkZfRk9VUkNDXSkge1xuICAgIGNhc2UgRk9VUkNDX0RYVDE6XG4gICAgICBibG9ja0J5dGVzID0gOFxuICAgICAgaWYgKGZsYWdzICYgRERQRl9SR0IpIHtcbiAgICAgICAgY2hhbm5lbHMgPSAzXG4gICAgICAgIGZvcm1hdCA9IEdMX0NPTVBSRVNTRURfUkdCX1MzVENfRFhUMV9FWFRcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZvcm1hdCA9IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDFfRVhUXG4gICAgICB9XG4gICAgICBicmVha1xuXG4gICAgY2FzZSBGT1VSQ0NfRFhUMzpcbiAgICAgIGJsb2NrQnl0ZXMgPSAxNlxuICAgICAgZm9ybWF0ID0gR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUM19FWFRcbiAgICAgIGJyZWFrXG5cbiAgICBjYXNlIEZPVVJDQ19EWFQ1OlxuICAgICAgYmxvY2tCeXRlcyA9IDE2XG4gICAgICBmb3JtYXQgPSBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQ1X0VYVFxuICAgICAgYnJlYWtcblxuICAgIGNhc2UgRk9VUkNDX0VUQzE6XG4gICAgICBibG9ja0J5dGVzID0gOFxuICAgICAgZm9ybWF0ID0gR0xfQ09NUFJFU1NFRF9SR0JfRVRDMV9XRUJHTFxuICAgICAgYnJlYWtcblxuICAgIC8vIFRPRE86IEltcGxlbWVudCBoZHIgYW5kIHVuY29tcHJlc3NlZCB0ZXh0dXJlc1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIC8vIEhhbmRsZSB1bmNvbXByZXNzZWQgZGF0YSBoZXJlXG4gICAgICBcbiAgfVxuXG4gIHZhciBwaXhlbEZsYWdzID0gaGVhZGVyW09GRl9QRl9GTEFHU11cblxuICB2YXIgbWlwbWFwQ291bnQgPSAxXG4gIGlmIChwaXhlbEZsYWdzICYgRERTRF9NSVBNQVBDT1VOVCkge1xuICAgIG1pcG1hcENvdW50ID0gTWF0aC5tYXgoMSwgaGVhZGVyW09GRl9NSVBNQVBdKVxuICB9XG5cbiAgdmFyIHB0ciA9IGhlYWRlcltPRkZfU0laRV0gKyA0XG5cbiAgdmFyIHJlc3VsdCA9IHtcbiAgICB3aWR0aDogd2lkdGgsXG4gICAgaGVpZ2h0OiBoZWlnaHQsXG4gICAgY2hhbm5lbHM6IGNoYW5uZWxzLFxuICAgIGZvcm1hdDogZm9ybWF0LFxuICAgIHR5cGU6IHR5cGUsXG4gICAgY29tcHJlc3NlZDogdHJ1ZSxcbiAgICBjdWJlOiBmYWxzZSxcbiAgICBwaXhlbHM6IFtdXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZU1pcHMgKHRhcmdldCkge1xuICAgIHZhciBtaXBXaWR0aCA9IHdpZHRoXG4gICAgdmFyIG1pcEhlaWdodCA9IGhlaWdodFxuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtaXBtYXBDb3VudDsgKytpKSB7XG4gICAgICB2YXIgc2l6ZSA9XG4gICAgICAgIE1hdGgubWF4KDEsIChtaXBXaWR0aCArIDMpID4+IDIpICpcbiAgICAgICAgTWF0aC5tYXgoMSwgKG1pcEhlaWdodCArIDMpID4+IDIpICpcbiAgICAgICAgYmxvY2tCeXRlc1xuICAgICAgcmVzdWx0LnBpeGVscy5wdXNoKHtcbiAgICAgICAgdGFyZ2V0OiB0YXJnZXQsXG4gICAgICAgIG1pcGxldmVsOiBpLFxuICAgICAgICB3aWR0aDogbWlwV2lkdGgsXG4gICAgICAgIGhlaWdodDogbWlwSGVpZ2h0LFxuICAgICAgICBkYXRhOiBuZXcgVWludDhBcnJheShhcnJheUJ1ZmZlciwgcHRyLCBzaXplKVxuICAgICAgfSlcbiAgICAgIHB0ciArPSBzaXplXG4gICAgICBtaXBXaWR0aCA+Pj0gMVxuICAgICAgbWlwSGVpZ2h0ID4+PSAxXG4gICAgfVxuICB9XG5cbiAgdmFyIGNhcHMyID0gaGVhZGVyW09GRl9DQVBTMl1cbiAgdmFyIGN1YmVtYXAgPSAhIShjYXBzMiAmIEREU0NBUFMyX0NVQkVNQVApXG4gIGlmIChjdWJlbWFwKSB7XG4gICAgXG4gICAgcmVzdWx0LmN1YmUgPSB0cnVlXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgIHBhcnNlTWlwcyhHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggKyBpKVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBwYXJzZU1pcHMoR0xfVEVYVFVSRV8yRClcbiAgfVxuXG4gIHJldHVybiByZXN1bHRcbn1cbiIsIi8qIGdsb2JhbHMgcmVxdWVzdEFuaW1hdGlvbkZyYW1lLCBjYW5jZWxBbmltYXRpb25GcmFtZSAqL1xuaWYgKHR5cGVvZiByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgPT09ICdmdW5jdGlvbicgJiZcbiAgICB0eXBlb2YgY2FuY2VsQW5pbWF0aW9uRnJhbWUgPT09ICdmdW5jdGlvbicpIHtcbiAgbW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgbmV4dDogZnVuY3Rpb24gKHgpIHsgcmV0dXJuIHJlcXVlc3RBbmltYXRpb25GcmFtZSh4KSB9LFxuICAgIGNhbmNlbDogZnVuY3Rpb24gKHgpIHsgcmV0dXJuIGNhbmNlbEFuaW1hdGlvbkZyYW1lKHgpIH1cbiAgfVxufSBlbHNlIHtcbiAgbW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgbmV4dDogZnVuY3Rpb24gKGNiKSB7XG4gICAgICBzZXRUaW1lb3V0KGNiLCAzMClcbiAgICB9LFxuICAgIGNhbmNlbDogY2xlYXJUaW1lb3V0XG4gIH1cbn1cbiIsIlxudmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vaXMtdHlwZWQtYXJyYXknKVxuXG52YXIgR0xfUkdCQSA9IDY0MDhcbnZhciBHTF9VTlNJR05FRF9CWVRFID0gNTEyMVxudmFyIEdMX1BBQ0tfQUxJR05NRU5UID0gMHgwRDA1XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcFJlYWRQaXhlbHMgKGdsLCByZWdsUG9sbCwgdmlld3BvcnRTdGF0ZSkge1xuICBmdW5jdGlvbiByZWFkUGl4ZWxzIChpbnB1dCkge1xuICAgIHZhciBvcHRpb25zID0gaW5wdXQgfHwge31cbiAgICBpZiAoaXNUeXBlZEFycmF5KGlucHV0KSkge1xuICAgICAgb3B0aW9ucyA9IHtcbiAgICAgICAgZGF0YTogb3B0aW9uc1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMikge1xuICAgICAgb3B0aW9ucyA9IHtcbiAgICAgICAgd2lkdGg6IGFyZ3VtZW50c1swXSB8IDAsXG4gICAgICAgIGhlaWdodDogYXJndW1lbnRzWzFdIHwgMFxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodHlwZW9mIGlucHV0ICE9PSAnb2JqZWN0Jykge1xuICAgICAgb3B0aW9ucyA9IHt9XG4gICAgfVxuXG4gICAgLy8gVXBkYXRlIFdlYkdMIHN0YXRlXG4gICAgcmVnbFBvbGwoKVxuXG4gICAgLy8gUmVhZCB2aWV3cG9ydCBzdGF0ZVxuICAgIHZhciB4ID0gb3B0aW9ucy54IHx8IDBcbiAgICB2YXIgeSA9IG9wdGlvbnMueSB8fCAwXG4gICAgdmFyIHdpZHRoID0gb3B0aW9ucy53aWR0aCB8fCB2aWV3cG9ydFN0YXRlLndpZHRoXG4gICAgdmFyIGhlaWdodCA9IG9wdGlvbnMuaGVpZ2h0IHx8IHZpZXdwb3J0U3RhdGUuaGVpZ2h0XG5cbiAgICAvLyBDb21wdXRlIHNpemVcbiAgICB2YXIgc2l6ZSA9IHdpZHRoICogaGVpZ2h0ICogNFxuXG4gICAgLy8gQWxsb2NhdGUgZGF0YVxuICAgIHZhciBkYXRhID0gb3B0aW9ucy5kYXRhIHx8IG5ldyBVaW50OEFycmF5KHNpemUpXG5cbiAgICAvLyBUeXBlIGNoZWNrXG4gICAgXG4gICAgXG5cbiAgICAvLyBSdW4gcmVhZCBwaXhlbHNcbiAgICBnbC5waXhlbFN0b3JlaShHTF9QQUNLX0FMSUdOTUVOVCwgNClcbiAgICBnbC5yZWFkUGl4ZWxzKHgsIHksIHdpZHRoLCBoZWlnaHQsIEdMX1JHQkEsIEdMX1VOU0lHTkVEX0JZVEUsIGRhdGEpXG5cbiAgICByZXR1cm4gZGF0YVxuICB9XG5cbiAgcmV0dXJuIHJlYWRQaXhlbHNcbn1cbiIsIlxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdmFsdWVzJylcblxudmFyIEdMX1JFTkRFUkJVRkZFUiA9IDB4OEQ0MVxuXG52YXIgR0xfUkdCQTQgPSAweDgwNTZcbnZhciBHTF9SR0I1X0ExID0gMHg4MDU3XG52YXIgR0xfUkdCNTY1ID0gMHg4RDYyXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UMTYgPSAweDgxQTVcbnZhciBHTF9TVEVOQ0lMX0lOREVYOCA9IDB4OEQ0OFxudmFyIEdMX0RFUFRIX1NURU5DSUwgPSAweDg0RjlcblxudmFyIEdMX1NSR0I4X0FMUEhBOF9FWFQgPSAweDhDNDNcblxudmFyIEdMX1JHQkEzMkZfRVhUID0gMHg4ODE0XG5cbnZhciBHTF9SR0JBMTZGX0VYVCA9IDB4ODgxQVxudmFyIEdMX1JHQjE2Rl9FWFQgPSAweDg4MUJcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoZ2wsIGV4dGVuc2lvbnMsIGxpbWl0cykge1xuICB2YXIgZm9ybWF0VHlwZXMgPSB7XG4gICAgJ3JnYmE0JzogR0xfUkdCQTQsXG4gICAgJ3JnYjU2NSc6IEdMX1JHQjU2NSxcbiAgICAncmdiNSBhMSc6IEdMX1JHQjVfQTEsXG4gICAgJ2RlcHRoJzogR0xfREVQVEhfQ09NUE9ORU5UMTYsXG4gICAgJ3N0ZW5jaWwnOiBHTF9TVEVOQ0lMX0lOREVYOCxcbiAgICAnZGVwdGggc3RlbmNpbCc6IEdMX0RFUFRIX1NURU5DSUxcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLmV4dF9zcmdiKSB7XG4gICAgZm9ybWF0VHlwZXNbJ3NyZ2JhJ10gPSBHTF9TUkdCOF9BTFBIQThfRVhUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfY29sb3JfYnVmZmVyX2hhbGZfZmxvYXQpIHtcbiAgICBmb3JtYXRUeXBlc1sncmdiYTE2ZiddID0gR0xfUkdCQTE2Rl9FWFRcbiAgICBmb3JtYXRUeXBlc1sncmdiMTZmJ10gPSBHTF9SR0IxNkZfRVhUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb2xvcl9idWZmZXJfZmxvYXQpIHtcbiAgICBmb3JtYXRUeXBlc1sncmdiYTMyZiddID0gR0xfUkdCQTMyRl9FWFRcbiAgfVxuXG4gIHZhciByZW5kZXJidWZmZXJDb3VudCA9IDBcbiAgdmFyIHJlbmRlcmJ1ZmZlclNldCA9IHt9XG5cbiAgZnVuY3Rpb24gUkVHTFJlbmRlcmJ1ZmZlciAoKSB7XG4gICAgdGhpcy5pZCA9IHJlbmRlcmJ1ZmZlckNvdW50KytcbiAgICB0aGlzLnJlZkNvdW50ID0gMVxuXG4gICAgdGhpcy5yZW5kZXJidWZmZXIgPSBudWxsXG5cbiAgICB0aGlzLmZvcm1hdCA9IEdMX1JHQkE0XG4gICAgdGhpcy53aWR0aCA9IDBcbiAgICB0aGlzLmhlaWdodCA9IDBcbiAgfVxuXG4gIFJFR0xSZW5kZXJidWZmZXIucHJvdG90eXBlLmRlY1JlZiA9IGZ1bmN0aW9uICgpIHtcbiAgICBpZiAoLS10aGlzLnJlZkNvdW50ID09PSAwKSB7XG4gICAgICBkZXN0cm95KHRoaXMpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcmVmcmVzaCAocmIpIHtcbiAgICBpZiAoIWdsLmlzUmVuZGVyYnVmZmVyKHJiLnJlbmRlcmJ1ZmZlcikpIHtcbiAgICAgIHJiLnJlbmRlcmJ1ZmZlciA9IGdsLmNyZWF0ZVJlbmRlcmJ1ZmZlcigpXG4gICAgfVxuICAgIGdsLmJpbmRSZW5kZXJidWZmZXIoR0xfUkVOREVSQlVGRkVSLCByYi5yZW5kZXJidWZmZXIpXG4gICAgZ2wucmVuZGVyYnVmZmVyU3RvcmFnZShcbiAgICAgIEdMX1JFTkRFUkJVRkZFUixcbiAgICAgIHJiLmZvcm1hdCxcbiAgICAgIHJiLndpZHRoLFxuICAgICAgcmIuaGVpZ2h0KVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAocmIpIHtcbiAgICB2YXIgaGFuZGxlID0gcmIucmVuZGVyYnVmZmVyXG4gICAgXG4gICAgZ2wuYmluZFJlbmRlcmJ1ZmZlcihHTF9SRU5ERVJCVUZGRVIsIG51bGwpXG4gICAgaWYgKGdsLmlzUmVuZGVyYnVmZmVyKGhhbmRsZSkpIHtcbiAgICAgIGdsLmRlbGV0ZVJlbmRlcmJ1ZmZlcihoYW5kbGUpXG4gICAgfVxuICAgIHJiLnJlbmRlcmJ1ZmZlciA9IG51bGxcbiAgICByYi5yZWZDb3VudCA9IDBcbiAgICBkZWxldGUgcmVuZGVyYnVmZmVyU2V0W3JiLmlkXVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlUmVuZGVyYnVmZmVyIChpbnB1dCkge1xuICAgIHZhciByZW5kZXJidWZmZXIgPSBuZXcgUkVHTFJlbmRlcmJ1ZmZlcigpXG4gICAgcmVuZGVyYnVmZmVyU2V0W3JlbmRlcmJ1ZmZlci5pZF0gPSByZW5kZXJidWZmZXJcblxuICAgIGZ1bmN0aW9uIHJlZ2xSZW5kZXJidWZmZXIgKGlucHV0KSB7XG4gICAgICB2YXIgb3B0aW9ucyA9IGlucHV0IHx8IHt9XG5cbiAgICAgIHZhciB3ID0gMFxuICAgICAgdmFyIGggPSAwXG4gICAgICBpZiAoJ3NoYXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBzaGFwZSA9IG9wdGlvbnMuc2hhcGVcbiAgICAgICAgXG4gICAgICAgIHcgPSBzaGFwZVswXSB8IDBcbiAgICAgICAgaCA9IHNoYXBlWzFdIHwgMFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKCdyYWRpdXMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB3ID0gaCA9IG9wdGlvbnMucmFkaXVzIHwgMFxuICAgICAgICB9XG4gICAgICAgIGlmICgnd2lkdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB3ID0gb3B0aW9ucy53aWR0aCB8IDBcbiAgICAgICAgfVxuICAgICAgICBpZiAoJ2hlaWdodCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGggPSBvcHRpb25zLmhlaWdodCB8IDBcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgdmFyIHMgPSBsaW1pdHMubWF4UmVuZGVyYnVmZmVyU2l6ZVxuICAgICAgXG4gICAgICByZWdsUmVuZGVyYnVmZmVyLndpZHRoID0gcmVuZGVyYnVmZmVyLndpZHRoID0gTWF0aC5tYXgodywgMSlcbiAgICAgIHJlZ2xSZW5kZXJidWZmZXIuaGVpZ2h0ID0gcmVuZGVyYnVmZmVyLmhlaWdodCA9IE1hdGgubWF4KGgsIDEpXG5cbiAgICAgIHJlbmRlcmJ1ZmZlci5mb3JtYXQgPSBHTF9SR0JBNFxuICAgICAgaWYgKCdmb3JtYXQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGZvcm1hdCA9IG9wdGlvbnMuZm9ybWF0XG4gICAgICAgIFxuICAgICAgICByZW5kZXJidWZmZXIuZm9ybWF0ID0gZm9ybWF0VHlwZXNbZm9ybWF0XVxuICAgICAgfVxuXG4gICAgICByZWZyZXNoKHJlbmRlcmJ1ZmZlcilcblxuICAgICAgcmV0dXJuIHJlZ2xSZW5kZXJidWZmZXJcbiAgICB9XG5cbiAgICByZWdsUmVuZGVyYnVmZmVyKGlucHV0KVxuXG4gICAgcmVnbFJlbmRlcmJ1ZmZlci5fcmVnbFR5cGUgPSAncmVuZGVyYnVmZmVyJ1xuICAgIHJlZ2xSZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlciA9IHJlbmRlcmJ1ZmZlclxuICAgIHJlZ2xSZW5kZXJidWZmZXIuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJlbmRlcmJ1ZmZlci5kZWNSZWYoKVxuICAgIH1cblxuICAgIHJldHVybiByZWdsUmVuZGVyYnVmZmVyXG4gIH1cblxuICBmdW5jdGlvbiByZWZyZXNoUmVuZGVyYnVmZmVycyAoKSB7XG4gICAgdmFsdWVzKHJlbmRlcmJ1ZmZlclNldCkuZm9yRWFjaChyZWZyZXNoKVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveVJlbmRlcmJ1ZmZlcnMgKCkge1xuICAgIHZhbHVlcyhyZW5kZXJidWZmZXJTZXQpLmZvckVhY2goZGVzdHJveSlcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY3JlYXRlOiBjcmVhdGVSZW5kZXJidWZmZXIsXG4gICAgcmVmcmVzaDogcmVmcmVzaFJlbmRlcmJ1ZmZlcnMsXG4gICAgY2xlYXI6IGRlc3Ryb3lSZW5kZXJidWZmZXJzXG4gIH1cbn1cbiIsIlxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdmFsdWVzJylcblxudmFyIERFRkFVTFRfRlJBR19TSEFERVIgPSAndm9pZCBtYWluKCl7Z2xfRnJhZ0NvbG9yPXZlYzQoMCwwLDAsMCk7fSdcbnZhciBERUZBVUxUX1ZFUlRfU0hBREVSID0gJ3ZvaWQgbWFpbigpe2dsX1Bvc2l0aW9uPXZlYzQoMCwwLDAsMCk7fSdcblxudmFyIEdMX0ZSQUdNRU5UX1NIQURFUiA9IDM1NjMyXG52YXIgR0xfVkVSVEVYX1NIQURFUiA9IDM1NjMzXG5cbnZhciBHTF9BQ1RJVkVfVU5JRk9STVMgPSAweDhCODZcbnZhciBHTF9BQ1RJVkVfQVRUUklCVVRFUyA9IDB4OEI4OVxuXG5mdW5jdGlvbiBBY3RpdmVJbmZvIChuYW1lLCBsb2NhdGlvbiwgaW5mbykge1xuICB0aGlzLm5hbWUgPSBuYW1lXG4gIHRoaXMubG9jYXRpb24gPSBsb2NhdGlvblxuICB0aGlzLmluZm8gPSBpbmZvXG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcFNoYWRlclN0YXRlIChcbiAgZ2wsXG4gIGF0dHJpYnV0ZVN0YXRlLFxuICB1bmlmb3JtU3RhdGUsXG4gIGNvbXBpbGVTaGFkZXJEcmF3LFxuICBzdHJpbmdTdG9yZSkge1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gZ2xzbCBjb21waWxhdGlvbiBhbmQgbGlua2luZ1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgdmFyIGZyYWdTaGFkZXJzID0ge31cbiAgdmFyIHZlcnRTaGFkZXJzID0ge31cblxuICBmdW5jdGlvbiBnZXRTaGFkZXIgKHR5cGUsIGlkKSB7XG4gICAgdmFyIGNhY2hlID0gdHlwZSA9PT0gR0xfRlJBR01FTlRfU0hBREVSID8gZnJhZ1NoYWRlcnMgOiB2ZXJ0U2hhZGVyc1xuICAgIHZhciBzaGFkZXIgPSBjYWNoZVtpZF1cblxuICAgIGlmICghc2hhZGVyKSB7XG4gICAgICB2YXIgc291cmNlID0gc3RyaW5nU3RvcmUuc3RyKGlkKVxuICAgICAgc2hhZGVyID0gZ2wuY3JlYXRlU2hhZGVyKHR5cGUpXG4gICAgICBnbC5zaGFkZXJTb3VyY2Uoc2hhZGVyLCBzb3VyY2UpXG4gICAgICBnbC5jb21waWxlU2hhZGVyKHNoYWRlcilcbiAgICAgIFxuICAgICAgY2FjaGVbaWRdID0gc2hhZGVyXG4gICAgfVxuXG4gICAgcmV0dXJuIHNoYWRlclxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIHByb2dyYW0gbGlua2luZ1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgdmFyIHByb2dyYW1DYWNoZSA9IHt9XG4gIHZhciBwcm9ncmFtTGlzdCA9IFtdXG5cbiAgZnVuY3Rpb24gUkVHTFByb2dyYW0gKGZyYWdJZCwgdmVydElkKSB7XG4gICAgdGhpcy5mcmFnSWQgPSBmcmFnSWRcbiAgICB0aGlzLnZlcnRJZCA9IHZlcnRJZFxuICAgIHRoaXMucHJvZ3JhbSA9IG51bGxcbiAgICB0aGlzLnVuaWZvcm1zID0gW11cbiAgICB0aGlzLmF0dHJpYnV0ZXMgPSBbXVxuICAgIHRoaXMuZHJhdyA9IGZ1bmN0aW9uICgpIHt9XG4gICAgdGhpcy5iYXRjaENhY2hlID0ge31cbiAgfVxuXG4gIGZ1bmN0aW9uIGxpbmtQcm9ncmFtIChkZXNjKSB7XG4gICAgdmFyIGksIGluZm9cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBjb21waWxlICYgbGlua1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgZnJhZ1NoYWRlciA9IGdldFNoYWRlcihHTF9GUkFHTUVOVF9TSEFERVIsIGRlc2MuZnJhZ0lkKVxuICAgIHZhciB2ZXJ0U2hhZGVyID0gZ2V0U2hhZGVyKEdMX1ZFUlRFWF9TSEFERVIsIGRlc2MudmVydElkKVxuXG4gICAgdmFyIHByb2dyYW0gPSBkZXNjLnByb2dyYW0gPSBnbC5jcmVhdGVQcm9ncmFtKClcbiAgICBnbC5hdHRhY2hTaGFkZXIocHJvZ3JhbSwgZnJhZ1NoYWRlcilcbiAgICBnbC5hdHRhY2hTaGFkZXIocHJvZ3JhbSwgdmVydFNoYWRlcilcbiAgICBnbC5saW5rUHJvZ3JhbShwcm9ncmFtKVxuICAgIFxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGdyYWIgdW5pZm9ybXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgdmFyIG51bVVuaWZvcm1zID0gZ2wuZ2V0UHJvZ3JhbVBhcmFtZXRlcihwcm9ncmFtLCBHTF9BQ1RJVkVfVU5JRk9STVMpXG4gICAgdmFyIHVuaWZvcm1zID0gZGVzYy51bmlmb3JtcyA9IFtdXG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgbnVtVW5pZm9ybXM7ICsraSkge1xuICAgICAgaW5mbyA9IGdsLmdldEFjdGl2ZVVuaWZvcm0ocHJvZ3JhbSwgaSlcbiAgICAgIGlmIChpbmZvKSB7XG4gICAgICAgIGlmIChpbmZvLnNpemUgPiAxKSB7XG4gICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBpbmZvLnNpemU7ICsraikge1xuICAgICAgICAgICAgdmFyIG5hbWUgPSBpbmZvLm5hbWUucmVwbGFjZSgnWzBdJywgJ1snICsgaiArICddJylcbiAgICAgICAgICAgIHVuaWZvcm1TdGF0ZS5kZWYobmFtZSlcbiAgICAgICAgICAgIHVuaWZvcm1zLnB1c2gobmV3IEFjdGl2ZUluZm8oXG4gICAgICAgICAgICAgIG5hbWUsXG4gICAgICAgICAgICAgIGdsLmdldFVuaWZvcm1Mb2NhdGlvbihwcm9ncmFtLCBuYW1lKSxcbiAgICAgICAgICAgICAgaW5mbykpXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHVuaWZvcm1TdGF0ZS5kZWYoaW5mby5uYW1lKVxuICAgICAgICAgIHVuaWZvcm1zLnB1c2gobmV3IEFjdGl2ZUluZm8oXG4gICAgICAgICAgICBpbmZvLm5hbWUsXG4gICAgICAgICAgICBnbC5nZXRVbmlmb3JtTG9jYXRpb24ocHJvZ3JhbSwgaW5mby5uYW1lKSxcbiAgICAgICAgICAgIGluZm8pKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGdyYWIgYXR0cmlidXRlc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgbnVtQXR0cmlidXRlcyA9IGdsLmdldFByb2dyYW1QYXJhbWV0ZXIocHJvZ3JhbSwgR0xfQUNUSVZFX0FUVFJJQlVURVMpXG4gICAgdmFyIGF0dHJpYnV0ZXMgPSBkZXNjLmF0dHJpYnV0ZXMgPSBbXVxuICAgIGZvciAoaSA9IDA7IGkgPCBudW1BdHRyaWJ1dGVzOyArK2kpIHtcbiAgICAgIGluZm8gPSBnbC5nZXRBY3RpdmVBdHRyaWIocHJvZ3JhbSwgaSlcbiAgICAgIGlmIChpbmZvKSB7XG4gICAgICAgIGF0dHJpYnV0ZVN0YXRlLmRlZihpbmZvLm5hbWUpXG4gICAgICAgIGF0dHJpYnV0ZXMucHVzaChuZXcgQWN0aXZlSW5mbyhcbiAgICAgICAgICBpbmZvLm5hbWUsXG4gICAgICAgICAgZ2wuZ2V0QXR0cmliTG9jYXRpb24ocHJvZ3JhbSwgaW5mby5uYW1lKSxcbiAgICAgICAgICBpbmZvKSlcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gY2xlYXIgY2FjaGVkIHJlbmRlcmluZyBtZXRob2RzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIGRlc2MuZHJhdyA9IGNvbXBpbGVTaGFkZXJEcmF3KGRlc2MpXG4gICAgZGVzYy5iYXRjaENhY2hlID0ge31cbiAgfVxuXG4gIGZ1bmN0aW9uIGdldFByb2dyYW0gKHZlcnRJZCwgZnJhZ0lkKSB7XG4gICAgdmFyIGNhY2hlID0gcHJvZ3JhbUNhY2hlW2ZyYWdJZF1cbiAgICBpZiAoIWNhY2hlKSB7XG4gICAgICBjYWNoZSA9IHByb2dyYW1DYWNoZVtmcmFnSWRdID0ge31cbiAgICB9XG4gICAgdmFyIHByb2dyYW0gPSBjYWNoZVt2ZXJ0SWRdXG4gICAgaWYgKCFwcm9ncmFtKSB7XG4gICAgICBwcm9ncmFtID0gbmV3IFJFR0xQcm9ncmFtKGZyYWdJZCwgdmVydElkKVxuICAgICAgbGlua1Byb2dyYW0ocHJvZ3JhbSlcbiAgICAgIGNhY2hlW3ZlcnRJZF0gPSBwcm9ncmFtXG4gICAgICBwcm9ncmFtTGlzdC5wdXNoKHByb2dyYW0pXG4gICAgfVxuICAgIHJldHVybiBwcm9ncmFtXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNyZWF0ZTogZ2V0UHJvZ3JhbSxcblxuICAgIGNsZWFyOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgZGVsZXRlU2hhZGVyID0gZ2wuZGVsZXRlU2hhZGVyLmJpbmQoZ2wpXG4gICAgICB2YWx1ZXMoZnJhZ1NoYWRlcnMpLmZvckVhY2goZGVsZXRlU2hhZGVyKVxuICAgICAgZnJhZ1NoYWRlcnMgPSB7fVxuICAgICAgdmFsdWVzKHZlcnRTaGFkZXJzKS5mb3JFYWNoKGRlbGV0ZVNoYWRlcilcbiAgICAgIHZlcnRTaGFkZXJzID0ge31cblxuICAgICAgcHJvZ3JhbUxpc3QuZm9yRWFjaChmdW5jdGlvbiAoZGVzYykge1xuICAgICAgICBnbC5kZWxldGVQcm9ncmFtKGRlc2MucHJvZ3JhbSlcbiAgICAgIH0pXG4gICAgICBwcm9ncmFtTGlzdC5sZW5ndGggPSAwXG4gICAgICBwcm9ncmFtQ2FjaGUgPSB7fVxuICAgIH0sXG5cbiAgICByZWZyZXNoOiBmdW5jdGlvbiAoKSB7XG4gICAgICBmcmFnU2hhZGVycyA9IHt9XG4gICAgICB2ZXJ0U2hhZGVycyA9IHt9XG4gICAgICBwcm9ncmFtTGlzdC5mb3JFYWNoKGxpbmtQcm9ncmFtKVxuICAgIH0sXG5cbiAgICBwcm9ncmFtczogWyBudWxsIF0sXG4gICAgZnJhZ1NoYWRlcnM6IFsgc3RyaW5nU3RvcmUuaWQoREVGQVVMVF9GUkFHX1NIQURFUikgXSxcbiAgICB2ZXJ0U2hhZGVyczogWyBzdHJpbmdTdG9yZS5pZChERUZBVUxUX1ZFUlRfU0hBREVSKSBdXG4gIH1cbn1cbiIsIi8vIEEgc3RhY2sgZm9yIG1hbmFnaW5nIHRoZSBzdGF0ZSBvZiBhIHNjYWxhci92ZWN0b3IgcGFyYW1ldGVyXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY3JlYXRlU3RhY2sgKGluaXQsIG9uQ2hhbmdlKSB7XG4gIHZhciBuID0gaW5pdC5sZW5ndGhcbiAgdmFyIHN0YWNrID0gaW5pdC5zbGljZSgpXG4gIHZhciBjdXJyZW50ID0gaW5pdC5zbGljZSgpXG4gIHZhciBkaXJ0eSA9IGZhbHNlXG4gIHZhciBmb3JjZURpcnR5ID0gdHJ1ZVxuXG4gIGZ1bmN0aW9uIHBvbGwgKCkge1xuICAgIHZhciBwdHIgPSBzdGFjay5sZW5ndGggLSBuXG4gICAgaWYgKGRpcnR5IHx8IGZvcmNlRGlydHkpIHtcbiAgICAgIHN3aXRjaCAobikge1xuICAgICAgICBjYXNlIDE6XG4gICAgICAgICAgb25DaGFuZ2Uoc3RhY2tbcHRyXSlcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlIDI6XG4gICAgICAgICAgb25DaGFuZ2Uoc3RhY2tbcHRyXSwgc3RhY2tbcHRyICsgMV0pXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSAzOlxuICAgICAgICAgIG9uQ2hhbmdlKHN0YWNrW3B0cl0sIHN0YWNrW3B0ciArIDFdLCBzdGFja1twdHIgKyAyXSlcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlIDQ6XG4gICAgICAgICAgb25DaGFuZ2Uoc3RhY2tbcHRyXSwgc3RhY2tbcHRyICsgMV0sIHN0YWNrW3B0ciArIDJdLCBzdGFja1twdHIgKyAzXSlcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlIDU6XG4gICAgICAgICAgb25DaGFuZ2Uoc3RhY2tbcHRyXSwgc3RhY2tbcHRyICsgMV0sIHN0YWNrW3B0ciArIDJdLCBzdGFja1twdHIgKyAzXSwgc3RhY2tbcHRyICsgNF0pXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSA2OlxuICAgICAgICAgIG9uQ2hhbmdlKHN0YWNrW3B0cl0sIHN0YWNrW3B0ciArIDFdLCBzdGFja1twdHIgKyAyXSwgc3RhY2tbcHRyICsgM10sIHN0YWNrW3B0ciArIDRdLCBzdGFja1twdHIgKyA1XSlcbiAgICAgICAgICBicmVha1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIG9uQ2hhbmdlLmFwcGx5KG51bGwsIHN0YWNrLnNsaWNlKHB0ciwgc3RhY2subGVuZ3RoKSlcbiAgICAgIH1cbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgKytpKSB7XG4gICAgICAgIGN1cnJlbnRbaV0gPSBzdGFja1twdHIgKyBpXVxuICAgICAgfVxuICAgICAgZm9yY2VEaXJ0eSA9IGRpcnR5ID0gZmFsc2VcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHB1c2g6IGZ1bmN0aW9uICgpIHtcbiAgICAgIGRpcnR5ID0gZmFsc2VcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgKytpKSB7XG4gICAgICAgIHZhciB4ID0gYXJndW1lbnRzW2ldXG4gICAgICAgIGRpcnR5ID0gZGlydHkgfHwgKHggIT09IGN1cnJlbnRbaV0pXG4gICAgICAgIHN0YWNrLnB1c2goeClcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgcG9wOiBmdW5jdGlvbiAoKSB7XG4gICAgICBkaXJ0eSA9IGZhbHNlXG4gICAgICBzdGFjay5sZW5ndGggLT0gblxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuOyArK2kpIHtcbiAgICAgICAgZGlydHkgPSBkaXJ0eSB8fCAoc3RhY2tbc3RhY2subGVuZ3RoIC0gbiArIGldICE9PSBjdXJyZW50W2ldKVxuICAgICAgfVxuICAgIH0sXG5cbiAgICBwb2xsOiBwb2xsLFxuXG4gICAgc2V0RGlydHk6IGZ1bmN0aW9uICgpIHtcbiAgICAgIGZvcmNlRGlydHkgPSB0cnVlXG4gICAgfVxuICB9XG59XG4iLCJ2YXIgY3JlYXRlU3RhY2sgPSByZXF1aXJlKCcuL3N0YWNrJylcbnZhciBjcmVhdGVFbnZpcm9ubWVudCA9IHJlcXVpcmUoJy4vY29kZWdlbicpXG5cbi8vIFdlYkdMIGNvbnN0YW50c1xudmFyIEdMX0NVTExfRkFDRSA9IDB4MEI0NFxudmFyIEdMX0JMRU5EID0gMHgwQkUyXG52YXIgR0xfRElUSEVSID0gMHgwQkQwXG52YXIgR0xfU1RFTkNJTF9URVNUID0gMHgwQjkwXG52YXIgR0xfREVQVEhfVEVTVCA9IDB4MEI3MVxudmFyIEdMX1NDSVNTT1JfVEVTVCA9IDB4MEMxMVxudmFyIEdMX1BPTFlHT05fT0ZGU0VUX0ZJTEwgPSAweDgwMzdcbnZhciBHTF9TQU1QTEVfQUxQSEFfVE9fQ09WRVJBR0UgPSAweDgwOUVcbnZhciBHTF9TQU1QTEVfQ09WRVJBR0UgPSAweDgwQTBcbnZhciBHTF9GVU5DX0FERCA9IDB4ODAwNlxudmFyIEdMX1pFUk8gPSAwXG52YXIgR0xfT05FID0gMVxudmFyIEdMX0ZST05UID0gMTAyOFxudmFyIEdMX0JBQ0sgPSAxMDI5XG52YXIgR0xfTEVTUyA9IDUxM1xudmFyIEdMX0NDVyA9IDIzMDVcbnZhciBHTF9BTFdBWVMgPSA1MTlcbnZhciBHTF9LRUVQID0gNzY4MFxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBDb250ZXh0U3RhdGUgKGdsLCBmcmFtZWJ1ZmZlclN0YXRlLCB2aWV3cG9ydFN0YXRlKSB7XG4gIGZ1bmN0aW9uIGNhcFN0YWNrIChjYXAsIGRmbHQpIHtcbiAgICB2YXIgcmVzdWx0ID0gY3JlYXRlU3RhY2soWyEhZGZsdF0sIGZ1bmN0aW9uIChmbGFnKSB7XG4gICAgICBpZiAoZmxhZykge1xuICAgICAgICBnbC5lbmFibGUoY2FwKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZ2wuZGlzYWJsZShjYXApXG4gICAgICB9XG4gICAgfSlcbiAgICByZXN1bHQuZmxhZyA9IGNhcFxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIC8vIENhcHMsIGZsYWdzIGFuZCBvdGhlciByYW5kb20gV2ViR0wgY29udGV4dCBzdGF0ZVxuICB2YXIgY29udGV4dFN0YXRlID0ge1xuICAgIC8vIERpdGhlcmluZ1xuICAgICdkaXRoZXInOiBjYXBTdGFjayhHTF9ESVRIRVIpLFxuXG4gICAgLy8gQmxlbmRpbmdcbiAgICAnYmxlbmQuZW5hYmxlJzogY2FwU3RhY2soR0xfQkxFTkQpLFxuICAgICdibGVuZC5jb2xvcic6IGNyZWF0ZVN0YWNrKFswLCAwLCAwLCAwXSwgZnVuY3Rpb24gKHIsIGcsIGIsIGEpIHtcbiAgICAgIGdsLmJsZW5kQ29sb3IociwgZywgYiwgYSlcbiAgICB9KSxcbiAgICAnYmxlbmQuZXF1YXRpb24nOiBjcmVhdGVTdGFjayhbR0xfRlVOQ19BREQsIEdMX0ZVTkNfQUREXSwgZnVuY3Rpb24gKHJnYiwgYSkge1xuICAgICAgZ2wuYmxlbmRFcXVhdGlvblNlcGFyYXRlKHJnYiwgYSlcbiAgICB9KSxcbiAgICAnYmxlbmQuZnVuYyc6IGNyZWF0ZVN0YWNrKFtcbiAgICAgIEdMX09ORSwgR0xfWkVSTywgR0xfT05FLCBHTF9aRVJPXG4gICAgXSwgZnVuY3Rpb24gKHNyY1JHQiwgZHN0UkdCLCBzcmNBbHBoYSwgZHN0QWxwaGEpIHtcbiAgICAgIGdsLmJsZW5kRnVuY1NlcGFyYXRlKHNyY1JHQiwgZHN0UkdCLCBzcmNBbHBoYSwgZHN0QWxwaGEpXG4gICAgfSksXG5cbiAgICAvLyBEZXB0aFxuICAgICdkZXB0aC5lbmFibGUnOiBjYXBTdGFjayhHTF9ERVBUSF9URVNULCB0cnVlKSxcbiAgICAnZGVwdGguZnVuYyc6IGNyZWF0ZVN0YWNrKFtHTF9MRVNTXSwgZnVuY3Rpb24gKGZ1bmMpIHtcbiAgICAgIGdsLmRlcHRoRnVuYyhmdW5jKVxuICAgIH0pLFxuICAgICdkZXB0aC5yYW5nZSc6IGNyZWF0ZVN0YWNrKFswLCAxXSwgZnVuY3Rpb24gKG5lYXIsIGZhcikge1xuICAgICAgZ2wuZGVwdGhSYW5nZShuZWFyLCBmYXIpXG4gICAgfSksXG4gICAgJ2RlcHRoLm1hc2snOiBjcmVhdGVTdGFjayhbdHJ1ZV0sIGZ1bmN0aW9uIChtKSB7XG4gICAgICBnbC5kZXB0aE1hc2sobSlcbiAgICB9KSxcblxuICAgIC8vIEZhY2UgY3VsbGluZ1xuICAgICdjdWxsLmVuYWJsZSc6IGNhcFN0YWNrKEdMX0NVTExfRkFDRSksXG4gICAgJ2N1bGwuZmFjZSc6IGNyZWF0ZVN0YWNrKFtHTF9CQUNLXSwgZnVuY3Rpb24gKG1vZGUpIHtcbiAgICAgIGdsLmN1bGxGYWNlKG1vZGUpXG4gICAgfSksXG5cbiAgICAvLyBGcm9udCBmYWNlIG9yaWVudGF0aW9uXG4gICAgJ2Zyb250RmFjZSc6IGNyZWF0ZVN0YWNrKFtHTF9DQ1ddLCBmdW5jdGlvbiAobW9kZSkge1xuICAgICAgZ2wuZnJvbnRGYWNlKG1vZGUpXG4gICAgfSksXG5cbiAgICAvLyBXcml0ZSBtYXNrc1xuICAgICdjb2xvck1hc2snOiBjcmVhdGVTdGFjayhbdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZV0sIGZ1bmN0aW9uIChyLCBnLCBiLCBhKSB7XG4gICAgICBnbC5jb2xvck1hc2sociwgZywgYiwgYSlcbiAgICB9KSxcblxuICAgIC8vIExpbmUgd2lkdGhcbiAgICAnbGluZVdpZHRoJzogY3JlYXRlU3RhY2soWzFdLCBmdW5jdGlvbiAodykge1xuICAgICAgZ2wubGluZVdpZHRoKHcpXG4gICAgfSksXG5cbiAgICAvLyBQb2x5Z29uIG9mZnNldFxuICAgICdwb2x5Z29uT2Zmc2V0LmVuYWJsZSc6IGNhcFN0YWNrKEdMX1BPTFlHT05fT0ZGU0VUX0ZJTEwpLFxuICAgICdwb2x5Z29uT2Zmc2V0Lm9mZnNldCc6IGNyZWF0ZVN0YWNrKFswLCAwXSwgZnVuY3Rpb24gKGZhY3RvciwgdW5pdHMpIHtcbiAgICAgIGdsLnBvbHlnb25PZmZzZXQoZmFjdG9yLCB1bml0cylcbiAgICB9KSxcblxuICAgIC8vIFNhbXBsZSBjb3ZlcmFnZVxuICAgICdzYW1wbGUuYWxwaGEnOiBjYXBTdGFjayhHTF9TQU1QTEVfQUxQSEFfVE9fQ09WRVJBR0UpLFxuICAgICdzYW1wbGUuZW5hYmxlJzogY2FwU3RhY2soR0xfU0FNUExFX0NPVkVSQUdFKSxcbiAgICAnc2FtcGxlLmNvdmVyYWdlJzogY3JlYXRlU3RhY2soWzEsIGZhbHNlXSwgZnVuY3Rpb24gKHZhbHVlLCBpbnZlcnQpIHtcbiAgICAgIGdsLnNhbXBsZUNvdmVyYWdlKHZhbHVlLCBpbnZlcnQpXG4gICAgfSksXG5cbiAgICAvLyBTdGVuY2lsXG4gICAgJ3N0ZW5jaWwuZW5hYmxlJzogY2FwU3RhY2soR0xfU1RFTkNJTF9URVNUKSxcbiAgICAnc3RlbmNpbC5tYXNrJzogY3JlYXRlU3RhY2soWy0xXSwgZnVuY3Rpb24gKG1hc2spIHtcbiAgICAgIGdsLnN0ZW5jaWxNYXNrKG1hc2spXG4gICAgfSksXG4gICAgJ3N0ZW5jaWwuZnVuYyc6IGNyZWF0ZVN0YWNrKFtcbiAgICAgIEdMX0FMV0FZUywgMCwgLTFcbiAgICBdLCBmdW5jdGlvbiAoZnVuYywgcmVmLCBtYXNrKSB7XG4gICAgICBnbC5zdGVuY2lsRnVuYyhmdW5jLCByZWYsIG1hc2spXG4gICAgfSksXG4gICAgJ3N0ZW5jaWwub3BGcm9udCc6IGNyZWF0ZVN0YWNrKFtcbiAgICAgIEdMX0tFRVAsIEdMX0tFRVAsIEdMX0tFRVBcbiAgICBdLCBmdW5jdGlvbiAoZmFpbCwgemZhaWwsIHBhc3MpIHtcbiAgICAgIGdsLnN0ZW5jaWxPcFNlcGFyYXRlKEdMX0ZST05ULCBmYWlsLCB6ZmFpbCwgcGFzcylcbiAgICB9KSxcbiAgICAnc3RlbmNpbC5vcEJhY2snOiBjcmVhdGVTdGFjayhbXG4gICAgICBHTF9LRUVQLCBHTF9LRUVQLCBHTF9LRUVQXG4gICAgXSwgZnVuY3Rpb24gKGZhaWwsIHpmYWlsLCBwYXNzKSB7XG4gICAgICBnbC5zdGVuY2lsT3BTZXBhcmF0ZShHTF9CQUNLLCBmYWlsLCB6ZmFpbCwgcGFzcylcbiAgICB9KSxcblxuICAgIC8vIFNjaXNzb3JcbiAgICAnc2Npc3Nvci5lbmFibGUnOiBjYXBTdGFjayhHTF9TQ0lTU09SX1RFU1QpLFxuICAgICdzY2lzc29yLmJveCc6IGNyZWF0ZVN0YWNrKFswLCAwLCAtMSwgLTFdLCBmdW5jdGlvbiAoeCwgeSwgdywgaCkge1xuICAgICAgdmFyIHdfID0gd1xuICAgICAgdmFyIGZibyA9IGZyYW1lYnVmZmVyU3RhdGUudG9wKClcbiAgICAgIGlmICh3IDwgMCkge1xuICAgICAgICBpZiAoZmJvKSB7XG4gICAgICAgICAgd18gPSBmYm8ud2lkdGggLSB4XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgd18gPSBnbC5kcmF3aW5nQnVmZmVyV2lkdGggLSB4XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHZhciBoXyA9IGhcbiAgICAgIGlmIChoIDwgMCkge1xuICAgICAgICBpZiAoZmJvKSB7XG4gICAgICAgICAgaF8gPSBmYm8uaGVpZ2h0IC0geVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGhfID0gZ2wuZHJhd2luZ0J1ZmZlckhlaWdodCAtIHlcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgZ2wuc2Npc3Nvcih4LCB5LCB3XywgaF8pXG4gICAgfSksXG5cbiAgICAvLyBWaWV3cG9ydFxuICAgICd2aWV3cG9ydCc6IGNyZWF0ZVN0YWNrKFswLCAwLCAtMSwgLTFdLCBmdW5jdGlvbiAoeCwgeSwgdywgaCkge1xuICAgICAgdmFyIHdfID0gd1xuICAgICAgdmFyIGZibyA9IGZyYW1lYnVmZmVyU3RhdGUudG9wKClcbiAgICAgIGlmICh3IDwgMCkge1xuICAgICAgICBpZiAoZmJvKSB7XG4gICAgICAgICAgd18gPSBmYm8ud2lkdGggLSB4XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgd18gPSBnbC5kcmF3aW5nQnVmZmVyV2lkdGggLSB4XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHZhciBoXyA9IGhcbiAgICAgIGlmIChoIDwgMCkge1xuICAgICAgICBpZiAoZmJvKSB7XG4gICAgICAgICAgaF8gPSBmYm8uaGVpZ2h0IC0geVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGhfID0gZ2wuZHJhd2luZ0J1ZmZlckhlaWdodCAtIHlcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgZ2wudmlld3BvcnQoeCwgeSwgd18sIGhfKVxuICAgICAgdmlld3BvcnRTdGF0ZS53aWR0aCA9IHdfXG4gICAgICB2aWV3cG9ydFN0YXRlLmhlaWdodCA9IGhfXG4gICAgfSlcbiAgfVxuXG4gIHZhciBlbnYgPSBjcmVhdGVFbnZpcm9ubWVudCgpXG4gIHZhciBwb2xsID0gZW52LnByb2MoJ3BvbGwnKVxuICB2YXIgcmVmcmVzaCA9IGVudi5wcm9jKCdyZWZyZXNoJylcbiAgT2JqZWN0LmtleXMoY29udGV4dFN0YXRlKS5mb3JFYWNoKGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgdmFyIFNUQUNLID0gZW52LmxpbmsoY29udGV4dFN0YXRlW3Byb3BdKVxuICAgIHBvbGwoU1RBQ0ssICcucG9sbCgpOycpXG4gICAgcmVmcmVzaChTVEFDSywgJy5zZXREaXJ0eSgpOycpXG4gIH0pXG5cbiAgdmFyIHByb2NzID0gZW52LmNvbXBpbGUoKVxuXG4gIHJldHVybiB7XG4gICAgY29udGV4dFN0YXRlOiBjb250ZXh0U3RhdGUsXG4gICAgdmlld3BvcnQ6IHZpZXdwb3J0U3RhdGUsXG4gICAgcG9sbDogcHJvY3MucG9sbCxcbiAgICByZWZyZXNoOiBwcm9jcy5yZWZyZXNoLFxuXG4gICAgbm90aWZ5Vmlld3BvcnRDaGFuZ2VkOiBmdW5jdGlvbiAoKSB7XG4gICAgICBjb250ZXh0U3RhdGUudmlld3BvcnQuc2V0RGlydHkoKVxuICAgICAgY29udGV4dFN0YXRlWydzY2lzc29yLmJveCddLnNldERpcnR5KClcbiAgICB9XG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY3JlYXRlU3RyaW5nU3RvcmUoKSB7XG4gIHZhciBzdHJpbmdJZHMgPSB7fVxuICB2YXIgc3RyaW5nVmFsdWVzID0gWycnXVxuICByZXR1cm4ge1xuICAgIGlkOiBmdW5jdGlvbiAoc3RyKSB7XG4gICAgICB2YXIgcmVzdWx0ID0gc3RyaW5nSWRzW3N0cl1cbiAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfVxuICAgICAgcmVzdWx0ID0gc3RyaW5nSWRzW3N0cl0gPSBzdHJpbmdWYWx1ZXMubGVuZ3RoXG4gICAgICBzdHJpbmdWYWx1ZXMucHVzaChzdHIpXG4gICAgICByZXR1cm4gcmVzdWx0XG4gICAgfSxcblxuICAgIHN0cjogZnVuY3Rpb24gKGlkKSB7XG4gICAgICByZXR1cm4gc3RyaW5nVmFsdWVzW2lkXVxuICAgIH1cbiAgfVxufVxuIiwiXG52YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi9leHRlbmQnKVxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdmFsdWVzJylcbnZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL2lzLXR5cGVkLWFycmF5JylcbnZhciBpc05EQXJyYXlMaWtlID0gcmVxdWlyZSgnLi9pcy1uZGFycmF5JylcbnZhciBsb2FkVGV4dHVyZSA9IHJlcXVpcmUoJy4vbG9hZC10ZXh0dXJlJylcbnZhciBjb252ZXJ0VG9IYWxmRmxvYXQgPSByZXF1aXJlKCcuL3RvLWhhbGYtZmxvYXQnKVxudmFyIHBhcnNlRERTID0gcmVxdWlyZSgnLi9wYXJzZS1kZHMnKVxuXG52YXIgR0xfQ09NUFJFU1NFRF9URVhUVVJFX0ZPUk1BVFMgPSAweDg2QTNcblxudmFyIEdMX1RFWFRVUkVfMkQgPSAweDBERTFcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQID0gMHg4NTEzXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YID0gMHg4NTE1XG5cbnZhciBHTF9SR0JBID0gMHgxOTA4XG52YXIgR0xfQUxQSEEgPSAweDE5MDZcbnZhciBHTF9SR0IgPSAweDE5MDdcbnZhciBHTF9MVU1JTkFOQ0UgPSAweDE5MDlcbnZhciBHTF9MVU1JTkFOQ0VfQUxQSEEgPSAweDE5MEFcblxudmFyIEdMX1JHQkE0ID0gMHg4MDU2XG52YXIgR0xfUkdCNV9BMSA9IDB4ODA1N1xudmFyIEdMX1JHQjU2NSA9IDB4OEQ2MlxuXG52YXIgR0xfVU5TSUdORURfU0hPUlRfNF80XzRfNCA9IDB4ODAzM1xudmFyIEdMX1VOU0lHTkVEX1NIT1JUXzVfNV81XzEgPSAweDgwMzRcbnZhciBHTF9VTlNJR05FRF9TSE9SVF81XzZfNSA9IDB4ODM2M1xudmFyIEdMX1VOU0lHTkVEX0lOVF8yNF84X1dFQkdMID0gMHg4NEZBXG5cbnZhciBHTF9ERVBUSF9DT01QT05FTlQgPSAweDE5MDJcbnZhciBHTF9ERVBUSF9TVEVOQ0lMID0gMHg4NEY5XG5cbnZhciBHTF9TUkdCX0VYVCA9IDB4OEM0MFxudmFyIEdMX1NSR0JfQUxQSEFfRVhUID0gMHg4QzQyXG5cbnZhciBHTF9IQUxGX0ZMT0FUX09FUyA9IDB4OEQ2MVxuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfUzNUQ19EWFQxX0VYVCA9IDB4ODNGMFxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDFfRVhUID0gMHg4M0YxXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUM19FWFQgPSAweDgzRjJcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQ1X0VYVCA9IDB4ODNGM1xuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfQVRDX1dFQkdMID0gMHg4QzkyXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19FWFBMSUNJVF9BTFBIQV9XRUJHTCA9IDB4OEM5M1xudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9BVENfSU5URVJQT0xBVEVEX0FMUEhBX1dFQkdMID0gMHg4N0VFXG5cbnZhciBHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ180QlBQVjFfSU1HID0gMHg4QzAwXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfUFZSVENfMkJQUFYxX0lNRyA9IDB4OEMwMVxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ180QlBQVjFfSU1HID0gMHg4QzAyXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzJCUFBWMV9JTUcgPSAweDhDMDNcblxudmFyIEdMX0NPTVBSRVNTRURfUkdCX0VUQzFfV0VCR0wgPSAweDhENjRcblxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSAweDE0MDFcbnZhciBHTF9VTlNJR05FRF9TSE9SVCA9IDB4MTQwM1xudmFyIEdMX1VOU0lHTkVEX0lOVCA9IDB4MTQwNVxudmFyIEdMX0ZMT0FUID0gMHgxNDA2XG5cbnZhciBHTF9URVhUVVJFX1dSQVBfUyA9IDB4MjgwMlxudmFyIEdMX1RFWFRVUkVfV1JBUF9UID0gMHgyODAzXG5cbnZhciBHTF9SRVBFQVQgPSAweDI5MDFcbnZhciBHTF9DTEFNUF9UT19FREdFID0gMHg4MTJGXG52YXIgR0xfTUlSUk9SRURfUkVQRUFUID0gMHg4MzcwXG5cbnZhciBHTF9URVhUVVJFX01BR19GSUxURVIgPSAweDI4MDBcbnZhciBHTF9URVhUVVJFX01JTl9GSUxURVIgPSAweDI4MDFcblxudmFyIEdMX05FQVJFU1QgPSAweDI2MDBcbnZhciBHTF9MSU5FQVIgPSAweDI2MDFcbnZhciBHTF9ORUFSRVNUX01JUE1BUF9ORUFSRVNUID0gMHgyNzAwXG52YXIgR0xfTElORUFSX01JUE1BUF9ORUFSRVNUID0gMHgyNzAxXG52YXIgR0xfTkVBUkVTVF9NSVBNQVBfTElORUFSID0gMHgyNzAyXG52YXIgR0xfTElORUFSX01JUE1BUF9MSU5FQVIgPSAweDI3MDNcblxudmFyIEdMX0dFTkVSQVRFX01JUE1BUF9ISU5UID0gMHg4MTkyXG52YXIgR0xfRE9OVF9DQVJFID0gMHgxMTAwXG52YXIgR0xfRkFTVEVTVCA9IDB4MTEwMVxudmFyIEdMX05JQ0VTVCA9IDB4MTEwMlxuXG52YXIgR0xfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQgPSAweDg0RkVcblxudmFyIEdMX1VOUEFDS19BTElHTk1FTlQgPSAweDBDRjVcbnZhciBHTF9VTlBBQ0tfRkxJUF9ZX1dFQkdMID0gMHg5MjQwXG52YXIgR0xfVU5QQUNLX1BSRU1VTFRJUExZX0FMUEhBX1dFQkdMID0gMHg5MjQxXG52YXIgR0xfVU5QQUNLX0NPTE9SU1BBQ0VfQ09OVkVSU0lPTl9XRUJHTCA9IDB4OTI0M1xuXG52YXIgR0xfQlJPV1NFUl9ERUZBVUxUX1dFQkdMID0gMHg5MjQ0XG5cbnZhciBHTF9URVhUVVJFMCA9IDB4ODRDMFxuXG52YXIgTUlQTUFQX0ZJTFRFUlMgPSBbXG4gIEdMX05FQVJFU1RfTUlQTUFQX05FQVJFU1QsXG4gIEdMX05FQVJFU1RfTUlQTUFQX0xJTkVBUixcbiAgR0xfTElORUFSX01JUE1BUF9ORUFSRVNULFxuICBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUlxuXVxuXG5mdW5jdGlvbiBpc1BvdzIgKHYpIHtcbiAgcmV0dXJuICEodiAmICh2IC0gMSkpICYmICghIXYpXG59XG5cbmZ1bmN0aW9uIGlzTnVtZXJpY0FycmF5IChhcnIpIHtcbiAgcmV0dXJuIChcbiAgICBBcnJheS5pc0FycmF5KGFycikgJiZcbiAgICAoYXJyLmxlbmd0aCA9PT0gMCB8fFxuICAgIHR5cGVvZiBhcnJbMF0gPT09ICdudW1iZXInKSlcbn1cblxuZnVuY3Rpb24gaXNSZWN0QXJyYXkgKGFycikge1xuICBpZiAoIUFycmF5LmlzQXJyYXkoYXJyKSkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG5cbiAgdmFyIHdpZHRoID0gYXJyLmxlbmd0aFxuICBpZiAod2lkdGggPT09IDAgfHwgIUFycmF5LmlzQXJyYXkoYXJyWzBdKSkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG5cbiAgdmFyIGhlaWdodCA9IGFyclswXS5sZW5ndGhcbiAgZm9yICh2YXIgaSA9IDE7IGkgPCB3aWR0aDsgKytpKSB7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGFycltpXSkgfHwgYXJyW2ldLmxlbmd0aCAhPT0gaGVpZ2h0KSB7XG4gICAgICByZXR1cm4gZmFsc2VcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRydWVcbn1cblxuZnVuY3Rpb24gY2xhc3NTdHJpbmcgKHgpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh4KVxufVxuXG5mdW5jdGlvbiBpc0NhbnZhc0VsZW1lbnQgKG9iamVjdCkge1xuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gJ1tvYmplY3QgSFRNTENhbnZhc0VsZW1lbnRdJ1xufVxuXG5mdW5jdGlvbiBpc0NvbnRleHQyRCAob2JqZWN0KSB7XG4gIHJldHVybiBjbGFzc1N0cmluZyhvYmplY3QpID09PSAnW29iamVjdCBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkRdJ1xufVxuXG5mdW5jdGlvbiBpc0ltYWdlRWxlbWVudCAob2JqZWN0KSB7XG4gIHJldHVybiBjbGFzc1N0cmluZyhvYmplY3QpID09PSAnW29iamVjdCBIVE1MSW1hZ2VFbGVtZW50XSdcbn1cblxuZnVuY3Rpb24gaXNWaWRlb0VsZW1lbnQgKG9iamVjdCkge1xuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gJ1tvYmplY3QgSFRNTFZpZGVvRWxlbWVudF0nXG59XG5cbmZ1bmN0aW9uIGlzUGVuZGluZ1hIUiAob2JqZWN0KSB7XG4gIHJldHVybiBjbGFzc1N0cmluZyhvYmplY3QpID09PSAnW29iamVjdCBYTUxIdHRwUmVxdWVzdF0nXG59XG5cbmZ1bmN0aW9uIGlzUGl4ZWxEYXRhIChvYmplY3QpIHtcbiAgcmV0dXJuIChcbiAgICB0eXBlb2Ygb2JqZWN0ID09PSAnc3RyaW5nJyB8fFxuICAgICghIW9iamVjdCAmJiAoXG4gICAgICBpc1R5cGVkQXJyYXkob2JqZWN0KSB8fFxuICAgICAgaXNOdW1lcmljQXJyYXkob2JqZWN0KSB8fFxuICAgICAgaXNOREFycmF5TGlrZShvYmplY3QpIHx8XG4gICAgICBpc0NhbnZhc0VsZW1lbnQob2JqZWN0KSB8fFxuICAgICAgaXNDb250ZXh0MkQob2JqZWN0KSB8fFxuICAgICAgaXNJbWFnZUVsZW1lbnQob2JqZWN0KSB8fFxuICAgICAgaXNWaWRlb0VsZW1lbnQob2JqZWN0KSB8fFxuICAgICAgaXNSZWN0QXJyYXkob2JqZWN0KSkpKVxufVxuXG4vLyBUcmFuc3Bvc2UgYW4gYXJyYXkgb2YgcGl4ZWxzXG5mdW5jdGlvbiB0cmFuc3Bvc2VQaXhlbHMgKGRhdGEsIG54LCBueSwgbmMsIHN4LCBzeSwgc2MsIG9mZikge1xuICB2YXIgcmVzdWx0ID0gbmV3IGRhdGEuY29uc3RydWN0b3IobnggKiBueSAqIG5jKVxuICB2YXIgcHRyID0gMFxuICBmb3IgKHZhciBpID0gMDsgaSA8IG55OyArK2kpIHtcbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IG54OyArK2opIHtcbiAgICAgIGZvciAodmFyIGsgPSAwOyBrIDwgbmM7ICsraykge1xuICAgICAgICByZXN1bHRbcHRyKytdID0gZGF0YVtzeSAqIGkgKyBzeCAqIGogKyBzYyAqIGsgKyBvZmZdXG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjcmVhdGVUZXh0dXJlU2V0IChnbCwgZXh0ZW5zaW9ucywgbGltaXRzLCByZWdsUG9sbCwgdmlld3BvcnRTdGF0ZSkge1xuICB2YXIgbWlwbWFwSGludCA9IHtcbiAgICBcImRvbid0IGNhcmVcIjogR0xfRE9OVF9DQVJFLFxuICAgICdkb250IGNhcmUnOiBHTF9ET05UX0NBUkUsXG4gICAgJ25pY2UnOiBHTF9OSUNFU1QsXG4gICAgJ2Zhc3QnOiBHTF9GQVNURVNUXG4gIH1cblxuICB2YXIgd3JhcE1vZGVzID0ge1xuICAgICdyZXBlYXQnOiBHTF9SRVBFQVQsXG4gICAgJ2NsYW1wJzogR0xfQ0xBTVBfVE9fRURHRSxcbiAgICAnbWlycm9yJzogR0xfTUlSUk9SRURfUkVQRUFUXG4gIH1cblxuICB2YXIgbWFnRmlsdGVycyA9IHtcbiAgICAnbmVhcmVzdCc6IEdMX05FQVJFU1QsXG4gICAgJ2xpbmVhcic6IEdMX0xJTkVBUlxuICB9XG5cbiAgdmFyIG1pbkZpbHRlcnMgPSBleHRlbmQoe1xuICAgICduZWFyZXN0IG1pcG1hcCBuZWFyZXN0JzogR0xfTkVBUkVTVF9NSVBNQVBfTkVBUkVTVCxcbiAgICAnbGluZWFyIG1pcG1hcCBuZWFyZXN0JzogR0xfTElORUFSX01JUE1BUF9ORUFSRVNULFxuICAgICduZWFyZXN0IG1pcG1hcCBsaW5lYXInOiBHTF9ORUFSRVNUX01JUE1BUF9MSU5FQVIsXG4gICAgJ2xpbmVhciBtaXBtYXAgbGluZWFyJzogR0xfTElORUFSX01JUE1BUF9MSU5FQVIsXG4gICAgJ21pcG1hcCc6IEdMX0xJTkVBUl9NSVBNQVBfTElORUFSXG4gIH0sIG1hZ0ZpbHRlcnMpXG5cbiAgdmFyIGNvbG9yU3BhY2UgPSB7XG4gICAgJ25vbmUnOiAwLFxuICAgICdicm93c2VyJzogR0xfQlJPV1NFUl9ERUZBVUxUX1dFQkdMXG4gIH1cblxuICB2YXIgdGV4dHVyZVR5cGVzID0ge1xuICAgICd1aW50OCc6IEdMX1VOU0lHTkVEX0JZVEUsXG4gICAgJ3JnYmE0JzogR0xfVU5TSUdORURfU0hPUlRfNF80XzRfNCxcbiAgICAncmdiNTY1JzogR0xfVU5TSUdORURfU0hPUlRfNV82XzUsXG4gICAgJ3JnYjUgYTEnOiBHTF9VTlNJR05FRF9TSE9SVF81XzVfNV8xXG4gIH1cblxuICB2YXIgdGV4dHVyZUZvcm1hdHMgPSB7XG4gICAgJ2FscGhhJzogR0xfQUxQSEEsXG4gICAgJ2x1bWluYW5jZSc6IEdMX0xVTUlOQU5DRSxcbiAgICAnbHVtaW5hbmNlIGFscGhhJzogR0xfTFVNSU5BTkNFX0FMUEhBLFxuICAgICdyZ2InOiBHTF9SR0IsXG4gICAgJ3JnYmEnOiBHTF9SR0JBLFxuICAgICdyZ2JhNCc6IEdMX1JHQkE0LFxuICAgICdyZ2I1IGExJzogR0xfUkdCNV9BMSxcbiAgICAncmdiNTY1JzogR0xfUkdCNTY1XG4gIH1cblxuICB2YXIgY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzID0ge31cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfc3JnYikge1xuICAgIHRleHR1cmVGb3JtYXRzLnNyZ2IgPSBHTF9TUkdCX0VYVFxuICAgIHRleHR1cmVGb3JtYXRzLnNyZ2JhID0gR0xfU1JHQl9BTFBIQV9FWFRcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2Zsb2F0KSB7XG4gICAgdGV4dHVyZVR5cGVzLmZsb2F0ID0gR0xfRkxPQVRcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2hhbGZfZmxvYXQpIHtcbiAgICB0ZXh0dXJlVHlwZXNbJ2hhbGYgZmxvYXQnXSA9IEdMX0hBTEZfRkxPQVRfT0VTXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9kZXB0aF90ZXh0dXJlKSB7XG4gICAgZXh0ZW5kKHRleHR1cmVGb3JtYXRzLCB7XG4gICAgICAnZGVwdGgnOiBHTF9ERVBUSF9DT01QT05FTlQsXG4gICAgICAnZGVwdGggc3RlbmNpbCc6IEdMX0RFUFRIX1NURU5DSUxcbiAgICB9KVxuXG4gICAgZXh0ZW5kKHRleHR1cmVUeXBlcywge1xuICAgICAgJ3VpbnQxNic6IEdMX1VOU0lHTkVEX1NIT1JULFxuICAgICAgJ3VpbnQzMic6IEdMX1VOU0lHTkVEX0lOVCxcbiAgICAgICdkZXB0aCBzdGVuY2lsJzogR0xfVU5TSUdORURfSU5UXzI0XzhfV0VCR0xcbiAgICB9KVxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX3MzdGMpIHtcbiAgICBleHRlbmQoY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzLCB7XG4gICAgICAncmdiIHMzdGMgZHh0MSc6IEdMX0NPTVBSRVNTRURfUkdCX1MzVENfRFhUMV9FWFQsXG4gICAgICAncmdiYSBzM3RjIGR4dDEnOiBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQxX0VYVCxcbiAgICAgICdyZ2JhIHMzdGMgZHh0Myc6IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDNfRVhULFxuICAgICAgJ3JnYmEgczN0YyBkeHQ1JzogR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUNV9FWFRcbiAgICB9KVxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX2F0Yykge1xuICAgIGV4dGVuZChjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMsIHtcbiAgICAgICdyZ2IgYXJjJzogR0xfQ09NUFJFU1NFRF9SR0JfQVRDX1dFQkdMLFxuICAgICAgJ3JnYmEgYXRjIGV4cGxpY2l0IGFscGhhJzogR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19FWFBMSUNJVF9BTFBIQV9XRUJHTCxcbiAgICAgICdyZ2JhIGF0YyBpbnRlcnBvbGF0ZWQgYWxwaGEnOiBHTF9DT01QUkVTU0VEX1JHQkFfQVRDX0lOVEVSUE9MQVRFRF9BTFBIQV9XRUJHTFxuICAgIH0pXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfcHZydGMpIHtcbiAgICBleHRlbmQoY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzLCB7XG4gICAgICAncmdiIHB2cnRjIDRicHB2MSc6IEdMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzRCUFBWMV9JTUcsXG4gICAgICAncmdiIHB2cnRjIDJicHB2MSc6IEdMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzJCUFBWMV9JTUcsXG4gICAgICAncmdiYSBwdnJ0YyA0YnBwdjEnOiBHTF9DT01QUkVTU0VEX1JHQkFfUFZSVENfNEJQUFYxX0lNRyxcbiAgICAgICdyZ2JhIHB2cnRjIDJicHB2MSc6IEdMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ18yQlBQVjFfSU1HXG4gICAgfSlcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9ldGMxKSB7XG4gICAgY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzWydyZ2IgZXRjMSddID0gR0xfQ09NUFJFU1NFRF9SR0JfRVRDMV9XRUJHTFxuICB9XG5cbiAgLy8gQ29weSBvdmVyIGFsbCB0ZXh0dXJlIGZvcm1hdHNcbiAgdmFyIHN1cHBvcnRlZENvbXByZXNzZWRGb3JtYXRzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoXG4gICAgZ2wuZ2V0UGFyYW1ldGVyKEdMX0NPTVBSRVNTRURfVEVYVFVSRV9GT1JNQVRTKSlcbiAgT2JqZWN0LmtleXMoY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdmFyIGZvcm1hdCA9IGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0c1tuYW1lXVxuICAgIGlmIChzdXBwb3J0ZWRDb21wcmVzc2VkRm9ybWF0cy5pbmRleE9mKGZvcm1hdCkgPj0gMCkge1xuICAgICAgdGV4dHVyZUZvcm1hdHNbbmFtZV0gPSBmb3JtYXRcbiAgICB9XG4gIH0pXG5cbiAgdmFyIHN1cHBvcnRlZEZvcm1hdHMgPSBPYmplY3Qua2V5cyh0ZXh0dXJlRm9ybWF0cylcbiAgbGltaXRzLnRleHR1cmVGb3JtYXRzID0gc3VwcG9ydGVkRm9ybWF0c1xuXG4gIHZhciBjb2xvckZvcm1hdHMgPSBzdXBwb3J0ZWRGb3JtYXRzLnJlZHVjZShmdW5jdGlvbiAoY29sb3IsIGtleSkge1xuICAgIHZhciBnbGVudW0gPSB0ZXh0dXJlRm9ybWF0c1trZXldXG4gICAgaWYgKGdsZW51bSA9PT0gR0xfTFVNSU5BTkNFIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfQUxQSEEgfHxcbiAgICAgICAgZ2xlbnVtID09PSBHTF9MVU1JTkFOQ0UgfHxcbiAgICAgICAgZ2xlbnVtID09PSBHTF9MVU1JTkFOQ0VfQUxQSEEgfHxcbiAgICAgICAgZ2xlbnVtID09PSBHTF9ERVBUSF9DT01QT05FTlQgfHxcbiAgICAgICAgZ2xlbnVtID09PSBHTF9ERVBUSF9TVEVOQ0lMKSB7XG4gICAgICBjb2xvcltnbGVudW1dID0gZ2xlbnVtXG4gICAgfSBlbHNlIGlmIChnbGVudW0gPT09IEdMX1JHQjVfQTEgfHwga2V5LmluZGV4T2YoJ3JnYmEnKSA+PSAwKSB7XG4gICAgICBjb2xvcltnbGVudW1dID0gR0xfUkdCQVxuICAgIH0gZWxzZSB7XG4gICAgICBjb2xvcltnbGVudW1dID0gR0xfUkdCXG4gICAgfVxuICAgIHJldHVybiBjb2xvclxuICB9LCB7fSlcblxuICAvLyBQaXhlbCBzdG9yYWdlIHBhcnNpbmdcbiAgZnVuY3Rpb24gUGl4ZWxJbmZvICh0YXJnZXQpIHtcbiAgICAvLyB0ZXggdGFyZ2V0XG4gICAgdGhpcy50YXJnZXQgPSB0YXJnZXRcblxuICAgIC8vIHBpeGVsU3RvcmVpIGluZm9cbiAgICB0aGlzLmZsaXBZID0gZmFsc2VcbiAgICB0aGlzLnByZW11bHRpcGx5QWxwaGEgPSBmYWxzZVxuICAgIHRoaXMudW5wYWNrQWxpZ25tZW50ID0gMVxuICAgIHRoaXMuY29sb3JTcGFjZSA9IDBcblxuICAgIC8vIHNoYXBlXG4gICAgdGhpcy53aWR0aCA9IDBcbiAgICB0aGlzLmhlaWdodCA9IDBcbiAgICB0aGlzLmNoYW5uZWxzID0gMFxuXG4gICAgLy8gZm9ybWF0IGFuZCB0eXBlXG4gICAgdGhpcy5mb3JtYXQgPSAwXG4gICAgdGhpcy5pbnRlcm5hbGZvcm1hdCA9IDBcbiAgICB0aGlzLnR5cGUgPSAwXG4gICAgdGhpcy5jb21wcmVzc2VkID0gZmFsc2VcblxuICAgIC8vIG1pcCBsZXZlbFxuICAgIHRoaXMubWlwbGV2ZWwgPSAwXG5cbiAgICAvLyBuZGFycmF5LWxpa2UgcGFyYW1ldGVyc1xuICAgIHRoaXMuc3RyaWRlWCA9IDBcbiAgICB0aGlzLnN0cmlkZVkgPSAwXG4gICAgdGhpcy5zdHJpZGVDID0gMFxuICAgIHRoaXMub2Zmc2V0ID0gMFxuXG4gICAgLy8gY29weSBwaXhlbHMgaW5mb1xuICAgIHRoaXMueCA9IDBcbiAgICB0aGlzLnkgPSAwXG4gICAgdGhpcy5jb3B5ID0gZmFsc2VcblxuICAgIC8vIGRhdGEgc291cmNlc1xuICAgIHRoaXMuZGF0YSA9IG51bGxcbiAgICB0aGlzLmltYWdlID0gbnVsbFxuICAgIHRoaXMudmlkZW8gPSBudWxsXG4gICAgdGhpcy5jYW52YXMgPSBudWxsXG4gICAgdGhpcy54aHIgPSBudWxsXG5cbiAgICAvLyBDT1JTXG4gICAgdGhpcy5jcm9zc09yaWdpbiA9IG51bGxcblxuICAgIC8vIGhvcnJpYmxlIHN0YXRlIGZsYWdzXG4gICAgdGhpcy5uZWVkc1BvbGwgPSBmYWxzZVxuICAgIHRoaXMubmVlZHNMaXN0ZW5lcnMgPSBmYWxzZVxuICB9XG5cbiAgZXh0ZW5kKFBpeGVsSW5mby5wcm90b3R5cGUsIHtcbiAgICBwYXJzZUZsYWdzOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgaWYgKHR5cGVvZiBvcHRpb25zICE9PSAnb2JqZWN0JyB8fCAhb3B0aW9ucykge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgaWYgKCdwcmVtdWx0aXBseUFscGhhJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIFxuICAgICAgICB0aGlzLnByZW11bHRpcGx5QWxwaGEgPSBvcHRpb25zLnByZW11bHRpcGx5QWxwaGFcbiAgICAgIH1cblxuICAgICAgaWYgKCdmbGlwWScgaW4gb3B0aW9ucykge1xuICAgICAgICBcbiAgICAgICAgdGhpcy5mbGlwWSA9IG9wdGlvbnMuZmxpcFlcbiAgICAgIH1cblxuICAgICAgaWYgKCdhbGlnbm1lbnQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgXG4gICAgICAgIHRoaXMudW5wYWNrQWxpZ25tZW50ID0gb3B0aW9ucy5hbGlnbm1lbnRcbiAgICAgIH1cblxuICAgICAgaWYgKCdjb2xvclNwYWNlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIFxuICAgICAgICB0aGlzLmNvbG9yU3BhY2UgPSBjb2xvclNwYWNlW29wdGlvbnMuY29sb3JTcGFjZV1cbiAgICAgIH1cblxuICAgICAgaWYgKCdmb3JtYXQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGZvcm1hdCA9IG9wdGlvbnMuZm9ybWF0XG4gICAgICAgIFxuICAgICAgICB0aGlzLmludGVybmFsZm9ybWF0ID0gdGV4dHVyZUZvcm1hdHNbZm9ybWF0XVxuICAgICAgICBpZiAoZm9ybWF0IGluIHRleHR1cmVUeXBlcykge1xuICAgICAgICAgIHRoaXMudHlwZSA9IHRleHR1cmVUeXBlc1tmb3JtYXRdXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZvcm1hdCBpbiBjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMpIHtcbiAgICAgICAgICB0aGlzLmNvbXByZXNzZWQgPSB0cnVlXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKCd0eXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciB0eXBlID0gb3B0aW9ucy50eXBlXG4gICAgICAgIFxuICAgICAgICB0aGlzLnR5cGUgPSB0ZXh0dXJlVHlwZXNbdHlwZV1cbiAgICAgIH1cblxuICAgICAgdmFyIHcgPSB0aGlzLndpZHRoXG4gICAgICB2YXIgaCA9IHRoaXMuaGVpZ2h0XG4gICAgICB2YXIgYyA9IHRoaXMuY2hhbm5lbHNcbiAgICAgIGlmICgnc2hhcGUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgXG4gICAgICAgIHcgPSBvcHRpb25zLnNoYXBlWzBdXG4gICAgICAgIGggPSBvcHRpb25zLnNoYXBlWzFdXG4gICAgICAgIGlmIChvcHRpb25zLnNoYXBlLmxlbmd0aCA9PT0gMykge1xuICAgICAgICAgIGMgPSBvcHRpb25zLnNoYXBlWzJdXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmICgncmFkaXVzJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdyA9IGggPSBvcHRpb25zLnJhZGl1c1xuICAgICAgICB9XG4gICAgICAgIGlmICgnd2lkdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB3ID0gb3B0aW9ucy53aWR0aFxuICAgICAgICB9XG4gICAgICAgIGlmICgnaGVpZ2h0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgaCA9IG9wdGlvbnMuaGVpZ2h0XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCdjaGFubmVscycgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGMgPSBvcHRpb25zLmNoYW5uZWxzXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHRoaXMud2lkdGggPSB3IHwgMFxuICAgICAgdGhpcy5oZWlnaHQgPSBoIHwgMFxuICAgICAgdGhpcy5jaGFubmVscyA9IGMgfCAwXG5cbiAgICAgIGlmICgnc3RyaWRlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBzdHJpZGUgPSBvcHRpb25zLnN0cmlkZVxuICAgICAgICBcbiAgICAgICAgdGhpcy5zdHJpZGVYID0gc3RyaWRlWzBdXG4gICAgICAgIHRoaXMuc3RyaWRlWSA9IHN0cmlkZVsxXVxuICAgICAgICBpZiAoc3RyaWRlLmxlbmd0aCA9PT0gMykge1xuICAgICAgICAgIHRoaXMuc3RyaWRlQyA9IHN0cmlkZVsyXVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMuc3RyaWRlQyA9IDFcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm5lZWRzVHJhbnNwb3NlID0gdHJ1ZVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5zdHJpZGVDID0gMVxuICAgICAgICB0aGlzLnN0cmlkZVggPSB0aGlzLnN0cmlkZUMgKiBjXG4gICAgICAgIHRoaXMuc3RyaWRlWSA9IHRoaXMuc3RyaWRlWCAqIHdcbiAgICAgIH1cblxuICAgICAgaWYgKCdvZmZzZXQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdGhpcy5vZmZzZXQgPSBvcHRpb25zLm9mZnNldCB8IDBcbiAgICAgICAgdGhpcy5uZWVkc1RyYW5zcG9zZSA9IHRydWVcbiAgICAgIH1cblxuICAgICAgaWYgKCdjcm9zc09yaWdpbicgaW4gb3B0aW9ucykge1xuICAgICAgICB0aGlzLmNyb3NzT3JpZ2luID0gb3B0aW9ucy5jcm9zc09yaWdpblxuICAgICAgfVxuICAgIH0sXG4gICAgcGFyc2U6IGZ1bmN0aW9uIChvcHRpb25zLCBtaXBsZXZlbCkge1xuICAgICAgdGhpcy5taXBsZXZlbCA9IG1pcGxldmVsXG4gICAgICB0aGlzLndpZHRoID0gdGhpcy53aWR0aCA+PiBtaXBsZXZlbFxuICAgICAgdGhpcy5oZWlnaHQgPSB0aGlzLmhlaWdodCA+PiBtaXBsZXZlbFxuXG4gICAgICB2YXIgZGF0YSA9IG9wdGlvbnNcbiAgICAgIHN3aXRjaCAodHlwZW9mIG9wdGlvbnMpIHtcbiAgICAgICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlICdvYmplY3QnOlxuICAgICAgICAgIGlmICghb3B0aW9ucykge1xuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgfVxuICAgICAgICAgIHRoaXMucGFyc2VGbGFncyhvcHRpb25zKVxuICAgICAgICAgIGlmIChpc1BpeGVsRGF0YShvcHRpb25zLmRhdGEpKSB7XG4gICAgICAgICAgICBkYXRhID0gb3B0aW9ucy5kYXRhXG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ3VuZGVmaW5lZCc6XG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgXG4gICAgICB9XG5cbiAgICAgIGlmICh0eXBlb2YgZGF0YSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgZGF0YSA9IGxvYWRUZXh0dXJlKGRhdGEsIHRoaXMuY3Jvc3NPcmlnaW4pXG4gICAgICB9XG5cbiAgICAgIHZhciBhcnJheSA9IG51bGxcbiAgICAgIHZhciBuZWVkc0NvbnZlcnQgPSBmYWxzZVxuXG4gICAgICBpZiAodGhpcy5jb21wcmVzc2VkKSB7XG4gICAgICAgIFxuICAgICAgfVxuXG4gICAgICBpZiAoZGF0YSA9PT0gbnVsbCkge1xuICAgICAgICAvLyBUT0RPXG4gICAgICB9IGVsc2UgaWYgKGlzVHlwZWRBcnJheShkYXRhKSkge1xuICAgICAgICB0aGlzLmRhdGEgPSBkYXRhXG4gICAgICB9IGVsc2UgaWYgKGlzTnVtZXJpY0FycmF5KGRhdGEpKSB7XG4gICAgICAgIGFycmF5ID0gZGF0YVxuICAgICAgICBuZWVkc0NvbnZlcnQgPSB0cnVlXG4gICAgICB9IGVsc2UgaWYgKGlzTkRBcnJheUxpa2UoZGF0YSkpIHtcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YS5kYXRhKSkge1xuICAgICAgICAgIGFycmF5ID0gZGF0YS5kYXRhXG4gICAgICAgICAgbmVlZHNDb252ZXJ0ID0gdHJ1ZVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMuZGF0YSA9IGRhdGEuZGF0YVxuICAgICAgICB9XG4gICAgICAgIHZhciBzaGFwZSA9IGRhdGEuc2hhcGVcbiAgICAgICAgdGhpcy53aWR0aCA9IHNoYXBlWzBdXG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gc2hhcGVbMV1cbiAgICAgICAgaWYgKHNoYXBlLmxlbmd0aCA9PT0gMykge1xuICAgICAgICAgIHRoaXMuY2hhbm5lbHMgPSBzaGFwZVsyXVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMuY2hhbm5lbHMgPSAxXG4gICAgICAgIH1cbiAgICAgICAgdmFyIHN0cmlkZSA9IGRhdGEuc3RyaWRlXG4gICAgICAgIHRoaXMuc3RyaWRlWCA9IGRhdGEuc3RyaWRlWzBdXG4gICAgICAgIHRoaXMuc3RyaWRlWSA9IGRhdGEuc3RyaWRlWzFdXG4gICAgICAgIGlmIChzdHJpZGUubGVuZ3RoID09PSAzKSB7XG4gICAgICAgICAgdGhpcy5zdHJpZGVDID0gZGF0YS5zdHJpZGVbMl1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLnN0cmlkZUMgPSAxXG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5vZmZzZXQgPSBkYXRhLm9mZnNldFxuICAgICAgICB0aGlzLm5lZWRzVHJhbnNwb3NlID0gdHJ1ZVxuICAgICAgfSBlbHNlIGlmIChpc0NhbnZhc0VsZW1lbnQoZGF0YSkgfHwgaXNDb250ZXh0MkQoZGF0YSkpIHtcbiAgICAgICAgaWYgKGlzQ2FudmFzRWxlbWVudChkYXRhKSkge1xuICAgICAgICAgIHRoaXMuY2FudmFzID0gZGF0YVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMuY2FudmFzID0gZGF0YS5jYW52YXNcbiAgICAgICAgfVxuICAgICAgICB0aGlzLndpZHRoID0gdGhpcy5jYW52YXMud2lkdGhcbiAgICAgICAgdGhpcy5oZWlnaHQgPSB0aGlzLmNhbnZhcy5oZWlnaHRcbiAgICAgICAgdGhpcy5zZXREZWZhdWx0Rm9ybWF0KClcbiAgICAgIH0gZWxzZSBpZiAoaXNJbWFnZUVsZW1lbnQoZGF0YSkpIHtcbiAgICAgICAgdGhpcy5pbWFnZSA9IGRhdGFcbiAgICAgICAgaWYgKCFkYXRhLmNvbXBsZXRlKSB7XG4gICAgICAgICAgdGhpcy53aWR0aCA9IHRoaXMud2lkdGggfHwgZGF0YS5uYXR1cmFsV2lkdGhcbiAgICAgICAgICB0aGlzLmhlaWdodCA9IHRoaXMuaGVpZ2h0IHx8IGRhdGEubmF0dXJhbEhlaWdodFxuICAgICAgICAgIHRoaXMubmVlZHNMaXN0ZW5lcnMgPSB0cnVlXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy53aWR0aCA9IGRhdGEubmF0dXJhbFdpZHRoXG4gICAgICAgICAgdGhpcy5oZWlnaHQgPSBkYXRhLm5hdHVyYWxIZWlnaHRcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNldERlZmF1bHRGb3JtYXQoKVxuICAgICAgfSBlbHNlIGlmIChpc1ZpZGVvRWxlbWVudChkYXRhKSkge1xuICAgICAgICB0aGlzLnZpZGVvID0gZGF0YVxuICAgICAgICBpZiAoZGF0YS5yZWFkeVN0YXRlID4gMSkge1xuICAgICAgICAgIHRoaXMud2lkdGggPSBkYXRhLndpZHRoXG4gICAgICAgICAgdGhpcy5oZWlnaHQgPSBkYXRhLmhlaWdodFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMud2lkdGggPSB0aGlzLndpZHRoIHx8IGRhdGEud2lkdGhcbiAgICAgICAgICB0aGlzLmhlaWdodCA9IHRoaXMuaGVpZ2h0IHx8IGRhdGEuaGVpZ2h0XG4gICAgICAgICAgdGhpcy5uZWVkc0xpc3RlbmVycyA9IHRydWVcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm5lZWRzUG9sbCA9IHRydWVcbiAgICAgICAgdGhpcy5zZXREZWZhdWx0Rm9ybWF0KClcbiAgICAgIH0gZWxzZSBpZiAoaXNQZW5kaW5nWEhSKGRhdGEpKSB7XG4gICAgICAgIHRoaXMueGhyID0gZGF0YVxuICAgICAgICB0aGlzLm5lZWRzTGlzdGVuZXJzID0gdHJ1ZVxuICAgICAgfSBlbHNlIGlmIChpc1JlY3RBcnJheShkYXRhKSkge1xuICAgICAgICB2YXIgdyA9IGRhdGEubGVuZ3RoXG4gICAgICAgIHZhciBoID0gZGF0YVswXS5sZW5ndGhcbiAgICAgICAgdmFyIGMgPSAxXG4gICAgICAgIHZhciBpLCBqLCBrLCBwXG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGFbMF1bMF0pKSB7XG4gICAgICAgICAgYyA9IGRhdGFbMF1bMF0ubGVuZ3RoXG4gICAgICAgICAgXG4gICAgICAgICAgYXJyYXkgPSBBcnJheSh3ICogaCAqIGMpXG4gICAgICAgICAgcCA9IDBcbiAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgaDsgKytqKSB7XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgdzsgKytpKSB7XG4gICAgICAgICAgICAgIGZvciAoayA9IDA7IGsgPCBjOyArK2spIHtcbiAgICAgICAgICAgICAgICBhcnJheVtwKytdID0gZGF0YVtpXVtqXVtrXVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGFycmF5ID0gQXJyYXkodyAqIGgpXG4gICAgICAgICAgcCA9IDBcbiAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgaDsgKytqKSB7XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgdzsgKytpKSB7XG4gICAgICAgICAgICAgIGFycmF5W3ArK10gPSBkYXRhW2ldW2pdXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMud2lkdGggPSB3XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaFxuICAgICAgICB0aGlzLmNoYW5uZWxzID0gY1xuICAgICAgICBuZWVkc0NvbnZlcnQgPSB0cnVlXG4gICAgICB9IGVsc2UgaWYgKG9wdGlvbnMuY29weSkge1xuICAgICAgICB0aGlzLmNvcHkgPSB0cnVlXG4gICAgICAgIHRoaXMueCA9IHRoaXMueCB8IDBcbiAgICAgICAgdGhpcy55ID0gdGhpcy55IHwgMFxuICAgICAgICB0aGlzLndpZHRoID0gKHRoaXMud2lkdGggfHwgdmlld3BvcnRTdGF0ZS53aWR0aCkgfCAwXG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gKHRoaXMuaGVpZ2h0IHx8IHZpZXdwb3J0U3RhdGUuaGVpZ2h0KSB8IDBcbiAgICAgICAgdGhpcy5zZXREZWZhdWx0Rm9ybWF0KClcbiAgICAgIH1cblxuICAgICAgLy8gRml4IHVwIG1pc3NpbmcgdHlwZSBpbmZvIGZvciB0eXBlZCBhcnJheXNcbiAgICAgIGlmICghdGhpcy50eXBlICYmIHRoaXMuZGF0YSkge1xuICAgICAgICBpZiAodGhpcy5mb3JtYXQgPT09IEdMX0RFUFRIX0NPTVBPTkVOVCkge1xuICAgICAgICAgIGlmICh0aGlzLmRhdGEgaW5zdGFuY2VvZiBVaW50MTZBcnJheSkge1xuICAgICAgICAgICAgdGhpcy50eXBlID0gR0xfVU5TSUdORURfU0hPUlRcbiAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuZGF0YSBpbnN0YW5jZW9mIFVpbnQzMkFycmF5KSB7XG4gICAgICAgICAgICB0aGlzLnR5cGUgPSBHTF9VTlNJR05FRF9JTlRcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5kYXRhIGluc3RhbmNlb2YgRmxvYXQzMkFycmF5KSB7XG4gICAgICAgICAgdGhpcy50eXBlID0gR0xfRkxPQVRcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBJbmZlciBkZWZhdWx0IGZvcm1hdFxuICAgICAgaWYgKCF0aGlzLmludGVybmFsZm9ybWF0KSB7XG4gICAgICAgIHZhciBjaGFubmVscyA9IHRoaXMuY2hhbm5lbHMgPSB0aGlzLmNoYW5uZWxzIHx8IDRcbiAgICAgICAgdGhpcy5pbnRlcm5hbGZvcm1hdCA9IFtcbiAgICAgICAgICBHTF9MVU1JTkFOQ0UsXG4gICAgICAgICAgR0xfTFVNSU5BTkNFX0FMUEhBLFxuICAgICAgICAgIEdMX1JHQixcbiAgICAgICAgICBHTF9SR0JBXVtjaGFubmVscyAtIDFdXG4gICAgICAgIFxuICAgICAgfVxuXG4gICAgICB2YXIgZm9ybWF0ID0gdGhpcy5pbnRlcm5hbGZvcm1hdFxuICAgICAgaWYgKGZvcm1hdCA9PT0gR0xfREVQVEhfQ09NUE9ORU5UIHx8IGZvcm1hdCA9PT0gR0xfREVQVEhfU1RFTkNJTCkge1xuICAgICAgICBcbiAgICAgICAgaWYgKGZvcm1hdCA9PT0gR0xfREVQVEhfQ09NUE9ORU5UKSB7XG4gICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZvcm1hdCA9PT0gR0xfREVQVEhfU1RFTkNJTCkge1xuICAgICAgICAgIFxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgfVxuXG4gICAgICAvLyBDb21wdXRlIGNvbG9yIGZvcm1hdCBhbmQgbnVtYmVyIG9mIGNoYW5uZWxzXG4gICAgICB2YXIgY29sb3JGb3JtYXQgPSB0aGlzLmZvcm1hdCA9IGNvbG9yRm9ybWF0c1tmb3JtYXRdXG4gICAgICBpZiAoIXRoaXMuY2hhbm5lbHMpIHtcbiAgICAgICAgc3dpdGNoIChjb2xvckZvcm1hdCkge1xuICAgICAgICAgIGNhc2UgR0xfTFVNSU5BTkNFOlxuICAgICAgICAgIGNhc2UgR0xfQUxQSEE6XG4gICAgICAgICAgY2FzZSBHTF9ERVBUSF9DT01QT05FTlQ6XG4gICAgICAgICAgICB0aGlzLmNoYW5uZWxzID0gMVxuICAgICAgICAgICAgYnJlYWtcblxuICAgICAgICAgIGNhc2UgR0xfREVQVEhfU1RFTkNJTDpcbiAgICAgICAgICBjYXNlIEdMX0xVTUlOQU5DRV9BTFBIQTpcbiAgICAgICAgICAgIHRoaXMuY2hhbm5lbHMgPSAyXG4gICAgICAgICAgICBicmVha1xuXG4gICAgICAgICAgY2FzZSBHTF9SR0I6XG4gICAgICAgICAgICB0aGlzLmNoYW5uZWxzID0gM1xuICAgICAgICAgICAgYnJlYWtcblxuICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICB0aGlzLmNoYW5uZWxzID0gNFxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIENoZWNrIHRoYXQgdGV4dHVyZSB0eXBlIGlzIHN1cHBvcnRlZFxuICAgICAgdmFyIHR5cGUgPSB0aGlzLnR5cGVcbiAgICAgIGlmICh0eXBlID09PSBHTF9GTE9BVCkge1xuICAgICAgICBcbiAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gR0xfSEFMRl9GTE9BVF9PRVMpIHtcbiAgICAgICAgXG4gICAgICB9IGVsc2UgaWYgKCF0eXBlKSB7XG4gICAgICAgIGlmIChmb3JtYXQgPT09IEdMX0RFUFRIX0NPTVBPTkVOVCkge1xuICAgICAgICAgIHR5cGUgPSBHTF9VTlNJR05FRF9JTlRcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0eXBlID0gR0xfVU5TSUdORURfQllURVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICB0aGlzLnR5cGUgPSB0eXBlXG5cbiAgICAgIC8vIGFwcGx5IGNvbnZlcnNpb25cbiAgICAgIGlmIChuZWVkc0NvbnZlcnQpIHtcbiAgICAgICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9CWVRFOlxuICAgICAgICAgICAgdGhpcy5kYXRhID0gbmV3IFVpbnQ4QXJyYXkoYXJyYXkpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlQ6XG4gICAgICAgICAgICB0aGlzLmRhdGEgPSBuZXcgVWludDE2QXJyYXkoYXJyYXkpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfSU5UOlxuICAgICAgICAgICAgdGhpcy5kYXRhID0gbmV3IFVpbnQzMkFycmF5KGFycmF5KVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlIEdMX0ZMT0FUOlxuICAgICAgICAgICAgdGhpcy5kYXRhID0gbmV3IEZsb2F0MzJBcnJheShhcnJheSlcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9IQUxGX0ZMT0FUX09FUzpcbiAgICAgICAgICAgIHRoaXMuZGF0YSA9IGNvbnZlcnRUb0hhbGZGbG9hdChhcnJheSlcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUXzVfNl81OlxuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlRfNV81XzVfMTpcbiAgICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUXzRfNF80XzQ6XG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9JTlRfMjRfOF9XRUJHTDpcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgYnJlYWtcblxuICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5kYXRhKSB7XG4gICAgICAgIC8vIGFwcGx5IHRyYW5zcG9zZVxuICAgICAgICBpZiAodGhpcy5uZWVkc1RyYW5zcG9zZSkge1xuICAgICAgICAgIHRoaXMuZGF0YSA9IHRyYW5zcG9zZVBpeGVscyhcbiAgICAgICAgICAgIHRoaXMuZGF0YSxcbiAgICAgICAgICAgIHRoaXMud2lkdGgsXG4gICAgICAgICAgICB0aGlzLmhlaWdodCxcbiAgICAgICAgICAgIHRoaXMuY2hhbm5lbHMsXG4gICAgICAgICAgICB0aGlzLnN0cmlkZVgsXG4gICAgICAgICAgICB0aGlzLnN0cmlkZVksXG4gICAgICAgICAgICB0aGlzLnN0cmlkZUMsXG4gICAgICAgICAgICB0aGlzLm9mZnNldClcbiAgICAgICAgfVxuICAgICAgICAvLyBjaGVjayBkYXRhIHR5cGVcbiAgICAgICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9CWVRFOlxuICAgICAgICAgICAgXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlRfNV82XzU6XG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVF81XzVfNV8xOlxuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlRfNF80XzRfNDpcbiAgICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUOlxuICAgICAgICAgIGNhc2UgR0xfSEFMRl9GTE9BVF9PRVM6XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9JTlQ6XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBjYXNlIEdMX0ZMT0FUOlxuICAgICAgICAgICAgXG4gICAgICAgICAgICBicmVha1xuXG4gICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIFxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHRoaXMubmVlZHNUcmFuc3Bvc2UgPSBmYWxzZVxuICAgIH0sXG5cbiAgICBzZXREZWZhdWx0Rm9ybWF0OiBmdW5jdGlvbiAoKSB7XG4gICAgICB0aGlzLmZvcm1hdCA9IHRoaXMuaW50ZXJuYWxmb3JtYXQgPSBHTF9SR0JBXG4gICAgICB0aGlzLnR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gICAgICB0aGlzLmNoYW5uZWxzID0gNFxuICAgICAgdGhpcy5jb21wcmVzc2VkID0gZmFsc2VcbiAgICB9LFxuXG4gICAgdXBsb2FkOiBmdW5jdGlvbiAocGFyYW1zKSB7XG4gICAgICBnbC5waXhlbFN0b3JlaShHTF9VTlBBQ0tfRkxJUF9ZX1dFQkdMLCB0aGlzLmZsaXBZKVxuICAgICAgZ2wucGl4ZWxTdG9yZWkoR0xfVU5QQUNLX1BSRU1VTFRJUExZX0FMUEhBX1dFQkdMLCB0aGlzLnByZW11bHRpcGx5QWxwaGEpXG4gICAgICBnbC5waXhlbFN0b3JlaShHTF9VTlBBQ0tfQ09MT1JTUEFDRV9DT05WRVJTSU9OX1dFQkdMLCB0aGlzLmNvbG9yU3BhY2UpXG4gICAgICBnbC5waXhlbFN0b3JlaShHTF9VTlBBQ0tfQUxJR05NRU5ULCB0aGlzLnVucGFja0FsaWdubWVudClcblxuICAgICAgdmFyIHRhcmdldCA9IHRoaXMudGFyZ2V0XG4gICAgICB2YXIgbWlwbGV2ZWwgPSB0aGlzLm1pcGxldmVsXG4gICAgICB2YXIgaW1hZ2UgPSB0aGlzLmltYWdlXG4gICAgICB2YXIgY2FudmFzID0gdGhpcy5jYW52YXNcbiAgICAgIHZhciB2aWRlbyA9IHRoaXMudmlkZW9cbiAgICAgIHZhciBkYXRhID0gdGhpcy5kYXRhXG4gICAgICB2YXIgaW50ZXJuYWxmb3JtYXQgPSB0aGlzLmludGVybmFsZm9ybWF0XG4gICAgICB2YXIgZm9ybWF0ID0gdGhpcy5mb3JtYXRcbiAgICAgIHZhciB0eXBlID0gdGhpcy50eXBlXG4gICAgICB2YXIgd2lkdGggPSB0aGlzLndpZHRoIHx8IE1hdGgubWF4KDEsIHBhcmFtcy53aWR0aCA+PiBtaXBsZXZlbClcbiAgICAgIHZhciBoZWlnaHQgPSB0aGlzLmhlaWdodCB8fCBNYXRoLm1heCgxLCBwYXJhbXMuaGVpZ2h0ID4+IG1pcGxldmVsKVxuICAgICAgaWYgKHZpZGVvICYmIHZpZGVvLnJlYWR5U3RhdGUgPiAyKSB7XG4gICAgICAgIGdsLnRleEltYWdlMkQodGFyZ2V0LCBtaXBsZXZlbCwgZm9ybWF0LCBmb3JtYXQsIHR5cGUsIHZpZGVvKVxuICAgICAgfSBlbHNlIGlmIChpbWFnZSAmJiBpbWFnZS5jb21wbGV0ZSkge1xuICAgICAgICBnbC50ZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGZvcm1hdCwgZm9ybWF0LCB0eXBlLCBpbWFnZSlcbiAgICAgIH0gZWxzZSBpZiAoY2FudmFzKSB7XG4gICAgICAgIGdsLnRleEltYWdlMkQodGFyZ2V0LCBtaXBsZXZlbCwgZm9ybWF0LCBmb3JtYXQsIHR5cGUsIGNhbnZhcylcbiAgICAgIH0gZWxzZSBpZiAodGhpcy5jb21wcmVzc2VkKSB7XG4gICAgICAgIGdsLmNvbXByZXNzZWRUZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGludGVybmFsZm9ybWF0LCB3aWR0aCwgaGVpZ2h0LCAwLCBkYXRhKVxuICAgICAgfSBlbHNlIGlmICh0aGlzLmNvcHkpIHtcbiAgICAgICAgcmVnbFBvbGwoKVxuICAgICAgICBnbC5jb3B5VGV4SW1hZ2UyRCh0YXJnZXQsIG1pcGxldmVsLCBmb3JtYXQsIHRoaXMueCwgdGhpcy55LCB3aWR0aCwgaGVpZ2h0LCAwKVxuICAgICAgfSBlbHNlIGlmIChkYXRhKSB7XG4gICAgICAgIGdsLnRleEltYWdlMkQodGFyZ2V0LCBtaXBsZXZlbCwgZm9ybWF0LCB3aWR0aCwgaGVpZ2h0LCAwLCBmb3JtYXQsIHR5cGUsIGRhdGEpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBnbC50ZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGZvcm1hdCwgd2lkdGggfHwgMSwgaGVpZ2h0IHx8IDEsIDAsIGZvcm1hdCwgdHlwZSwgbnVsbClcbiAgICAgIH1cbiAgICB9XG4gIH0pXG5cbiAgZnVuY3Rpb24gVGV4UGFyYW1zICh0YXJnZXQpIHtcbiAgICB0aGlzLnRhcmdldCA9IHRhcmdldFxuXG4gICAgLy8gRGVmYXVsdCBpbWFnZSBzaGFwZSBpbmZvXG4gICAgdGhpcy53aWR0aCA9IDBcbiAgICB0aGlzLmhlaWdodCA9IDBcbiAgICB0aGlzLmZvcm1hdCA9IDBcbiAgICB0aGlzLmludGVybmFsZm9ybWF0ID0gMFxuICAgIHRoaXMudHlwZSA9IDBcblxuICAgIC8vIHdyYXAgbW9kZVxuICAgIHRoaXMud3JhcFMgPSBHTF9DTEFNUF9UT19FREdFXG4gICAgdGhpcy53cmFwVCA9IEdMX0NMQU1QX1RPX0VER0VcblxuICAgIC8vIGZpbHRlcmluZ1xuICAgIHRoaXMubWluRmlsdGVyID0gMFxuICAgIHRoaXMubWFnRmlsdGVyID0gR0xfTkVBUkVTVFxuICAgIHRoaXMuYW5pc290cm9waWMgPSAxXG5cbiAgICAvLyBtaXBtYXBzXG4gICAgdGhpcy5nZW5NaXBtYXBzID0gZmFsc2VcbiAgICB0aGlzLm1pcG1hcEhpbnQgPSBHTF9ET05UX0NBUkVcbiAgfVxuXG4gIGV4dGVuZChUZXhQYXJhbXMucHJvdG90eXBlLCB7XG4gICAgcGFyc2U6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbnMgIT09ICdvYmplY3QnIHx8ICFvcHRpb25zKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuXG4gICAgICBpZiAoJ21pbicgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgbWluRmlsdGVyID0gb3B0aW9ucy5taW5cbiAgICAgICAgXG4gICAgICAgIHRoaXMubWluRmlsdGVyID0gbWluRmlsdGVyc1ttaW5GaWx0ZXJdXG4gICAgICB9XG5cbiAgICAgIGlmICgnbWFnJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBtYWdGaWx0ZXIgPSBvcHRpb25zLm1hZ1xuICAgICAgICBcbiAgICAgICAgdGhpcy5tYWdGaWx0ZXIgPSBtYWdGaWx0ZXJzW21hZ0ZpbHRlcl1cbiAgICAgIH1cblxuICAgICAgdmFyIHdyYXBTID0gdGhpcy53cmFwU1xuICAgICAgdmFyIHdyYXBUID0gdGhpcy53cmFwVFxuICAgICAgaWYgKCd3cmFwJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciB3cmFwID0gb3B0aW9ucy53cmFwXG4gICAgICAgIGlmICh0eXBlb2Ygd3JhcCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICBcbiAgICAgICAgICB3cmFwUyA9IHdyYXBUID0gd3JhcE1vZGVzW3dyYXBdXG4gICAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheSh3cmFwKSkge1xuICAgICAgICAgIFxuICAgICAgICAgIFxuICAgICAgICAgIHdyYXBTID0gd3JhcE1vZGVzW3dyYXBbMF1dXG4gICAgICAgICAgd3JhcFQgPSB3cmFwTW9kZXNbd3JhcFsxXV1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKCd3cmFwUycgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHZhciBvcHRXcmFwUyA9IG9wdGlvbnMud3JhcFNcbiAgICAgICAgICBcbiAgICAgICAgICB3cmFwUyA9IHdyYXBNb2Rlc1tvcHRXcmFwU11cbiAgICAgICAgfVxuICAgICAgICBpZiAoJ3dyYXBUJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdmFyIG9wdFdyYXBUID0gb3B0aW9ucy53cmFwVFxuICAgICAgICAgIFxuICAgICAgICAgIHdyYXBUID0gd3JhcE1vZGVzW29wdFdyYXBUXVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICB0aGlzLndyYXBTID0gd3JhcFNcbiAgICAgIHRoaXMud3JhcFQgPSB3cmFwVFxuXG4gICAgICBpZiAoJ2FuaXNvdHJvcGljJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBhbmlzb3Ryb3BpYyA9IG9wdGlvbnMuYW5pc290cm9waWNcbiAgICAgICAgXG4gICAgICAgIHRoaXMuYW5pc290cm9waWMgPSBvcHRpb25zLmFuaXNvdHJvcGljXG4gICAgICB9XG5cbiAgICAgIGlmICgnbWlwbWFwJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBtaXBtYXAgPSBvcHRpb25zLm1pcG1hcFxuICAgICAgICBzd2l0Y2ggKHR5cGVvZiBtaXBtYXApIHtcbiAgICAgICAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgICAgICAgXG4gICAgICAgICAgICB0aGlzLm1pcG1hcEhpbnQgPSBtaXBtYXBIaW50W21pcG1hcF1cbiAgICAgICAgICAgIHRoaXMuZ2VuTWlwbWFwcyA9IHRydWVcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBjYXNlICdib29sZWFuJzpcbiAgICAgICAgICAgIHRoaXMuZ2VuTWlwbWFwcyA9ICEhbWlwbWFwXG4gICAgICAgICAgICBicmVha1xuXG4gICAgICAgICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuXG4gICAgdXBsb2FkOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgdGFyZ2V0ID0gdGhpcy50YXJnZXRcbiAgICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBHTF9URVhUVVJFX01JTl9GSUxURVIsIHRoaXMubWluRmlsdGVyKVxuICAgICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfTUFHX0ZJTFRFUiwgdGhpcy5tYWdGaWx0ZXIpXG4gICAgICBnbC50ZXhQYXJhbWV0ZXJpKHRhcmdldCwgR0xfVEVYVFVSRV9XUkFQX1MsIHRoaXMud3JhcFMpXG4gICAgICBnbC50ZXhQYXJhbWV0ZXJpKHRhcmdldCwgR0xfVEVYVFVSRV9XUkFQX1QsIHRoaXMud3JhcFQpXG4gICAgICBpZiAoZXh0ZW5zaW9ucy5leHRfdGV4dHVyZV9maWx0ZXJfYW5pc290cm9waWMpIHtcbiAgICAgICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfTUFYX0FOSVNPVFJPUFlfRVhULCB0aGlzLmFuaXNvdHJvcGljKVxuICAgICAgfVxuICAgICAgaWYgKHRoaXMuZ2VuTWlwbWFwcykge1xuICAgICAgICBnbC5oaW50KEdMX0dFTkVSQVRFX01JUE1BUF9ISU5ULCB0aGlzLm1pcG1hcEhpbnQpXG4gICAgICAgIGdsLmdlbmVyYXRlTWlwbWFwKHRhcmdldClcbiAgICAgIH1cbiAgICB9XG4gIH0pXG5cbiAgLy8gRmluYWwgcGFzcyB0byBtZXJnZSBwYXJhbXMgYW5kIHBpeGVsIGRhdGFcbiAgZnVuY3Rpb24gY2hlY2tUZXh0dXJlQ29tcGxldGUgKHBhcmFtcywgcGl4ZWxzKSB7XG4gICAgdmFyIGksIHBpeG1hcFxuXG4gICAgdmFyIHR5cGUgPSAwXG4gICAgdmFyIGZvcm1hdCA9IDBcbiAgICB2YXIgaW50ZXJuYWxmb3JtYXQgPSAwXG4gICAgdmFyIHdpZHRoID0gMFxuICAgIHZhciBoZWlnaHQgPSAwXG4gICAgdmFyIGNoYW5uZWxzID0gMFxuICAgIHZhciBjb21wcmVzc2VkID0gZmFsc2VcbiAgICB2YXIgbmVlZHNQb2xsID0gZmFsc2VcbiAgICB2YXIgbmVlZHNMaXN0ZW5lcnMgPSBmYWxzZVxuICAgIHZhciBtaXBNYXNrMkQgPSAwXG4gICAgdmFyIG1pcE1hc2tDdWJlID0gWzAsIDAsIDAsIDAsIDAsIDBdXG4gICAgdmFyIGN1YmVNYXNrID0gMFxuICAgIHZhciBoYXNNaXAgPSBmYWxzZVxuICAgIGZvciAoaSA9IDA7IGkgPCBwaXhlbHMubGVuZ3RoOyArK2kpIHtcbiAgICAgIHBpeG1hcCA9IHBpeGVsc1tpXVxuICAgICAgd2lkdGggPSB3aWR0aCB8fCAocGl4bWFwLndpZHRoIDw8IHBpeG1hcC5taXBsZXZlbClcbiAgICAgIGhlaWdodCA9IGhlaWdodCB8fCAocGl4bWFwLmhlaWdodCA8PCBwaXhtYXAubWlwbGV2ZWwpXG4gICAgICB0eXBlID0gdHlwZSB8fCBwaXhtYXAudHlwZVxuICAgICAgZm9ybWF0ID0gZm9ybWF0IHx8IHBpeG1hcC5mb3JtYXRcbiAgICAgIGludGVybmFsZm9ybWF0ID0gaW50ZXJuYWxmb3JtYXQgfHwgcGl4bWFwLmludGVybmFsZm9ybWF0XG4gICAgICBjaGFubmVscyA9IGNoYW5uZWxzIHx8IHBpeG1hcC5jaGFubmVsc1xuICAgICAgbmVlZHNQb2xsID0gbmVlZHNQb2xsIHx8IHBpeG1hcC5uZWVkc1BvbGxcbiAgICAgIG5lZWRzTGlzdGVuZXJzID0gbmVlZHNMaXN0ZW5lcnMgfHwgcGl4bWFwLm5lZWRzTGlzdGVuZXJzXG4gICAgICBjb21wcmVzc2VkID0gY29tcHJlc3NlZCB8fCBwaXhtYXAuY29tcHJlc3NlZFxuXG4gICAgICB2YXIgbWlwbGV2ZWwgPSBwaXhtYXAubWlwbGV2ZWxcbiAgICAgIHZhciB0YXJnZXQgPSBwaXhtYXAudGFyZ2V0XG4gICAgICBoYXNNaXAgPSBoYXNNaXAgfHwgKG1pcGxldmVsID4gMClcbiAgICAgIGlmICh0YXJnZXQgPT09IEdMX1RFWFRVUkVfMkQpIHtcbiAgICAgICAgbWlwTWFzazJEIHw9ICgxIDw8IG1pcGxldmVsKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGZhY2UgPSB0YXJnZXQgLSBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1hcbiAgICAgICAgbWlwTWFza0N1YmVbZmFjZV0gfD0gKDEgPDwgbWlwbGV2ZWwpXG4gICAgICAgIGN1YmVNYXNrIHw9ICgxIDw8IGZhY2UpXG4gICAgICB9XG4gICAgfVxuXG4gICAgcGFyYW1zLm5lZWRzUG9sbCA9IG5lZWRzUG9sbFxuICAgIHBhcmFtcy5uZWVkc0xpc3RlbmVycyA9IG5lZWRzTGlzdGVuZXJzXG4gICAgcGFyYW1zLndpZHRoID0gd2lkdGhcbiAgICBwYXJhbXMuaGVpZ2h0ID0gaGVpZ2h0XG4gICAgcGFyYW1zLmZvcm1hdCA9IGZvcm1hdFxuICAgIHBhcmFtcy5pbnRlcm5hbGZvcm1hdCA9IGludGVybmFsZm9ybWF0XG4gICAgcGFyYW1zLnR5cGUgPSB0eXBlXG5cbiAgICB2YXIgbWlwTWFzayA9IGhhc01pcCA/ICh3aWR0aCA8PCAxKSAtIDEgOiAxXG4gICAgaWYgKHBhcmFtcy50YXJnZXQgPT09IEdMX1RFWFRVUkVfMkQpIHtcbiAgICAgIFxuICAgICAgXG4gICAgfSBlbHNlIHtcbiAgICAgIFxuICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICBcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgbWlwRmlsdGVyID0gKE1JUE1BUF9GSUxURVJTLmluZGV4T2YocGFyYW1zLm1pbkZpbHRlcikgPj0gMClcbiAgICBwYXJhbXMuZ2VuTWlwbWFwcyA9ICFoYXNNaXAgJiYgKHBhcmFtcy5nZW5NaXBtYXBzIHx8IG1pcEZpbHRlcilcbiAgICB2YXIgdXNlTWlwbWFwcyA9IGhhc01pcCB8fCBwYXJhbXMuZ2VuTWlwbWFwc1xuXG4gICAgaWYgKCFwYXJhbXMubWluRmlsdGVyKSB7XG4gICAgICBwYXJhbXMubWluRmlsdGVyID0gdXNlTWlwbWFwc1xuICAgICAgICA/IEdMX0xJTkVBUl9NSVBNQVBfTElORUFSXG4gICAgICAgIDogR0xfTkVBUkVTVFxuICAgIH0gZWxzZSB7XG4gICAgICBcbiAgICB9XG5cbiAgICBpZiAodXNlTWlwbWFwcykge1xuICAgICAgXG4gICAgfVxuXG4gICAgaWYgKHBhcmFtcy5nZW5NaXBtYXBzKSB7XG4gICAgICBcbiAgICB9XG5cbiAgICBwYXJhbXMud3JhcFMgPSBwYXJhbXMud3JhcFMgfHwgR0xfQ0xBTVBfVE9fRURHRVxuICAgIHBhcmFtcy53cmFwVCA9IHBhcmFtcy53cmFwVCB8fCBHTF9DTEFNUF9UT19FREdFXG4gICAgaWYgKHBhcmFtcy53cmFwUyAhPT0gR0xfQ0xBTVBfVE9fRURHRSB8fFxuICAgICAgICBwYXJhbXMud3JhcFQgIT09IEdMX0NMQU1QX1RPX0VER0UpIHtcbiAgICAgIFxuICAgIH1cblxuICAgIGlmICgodHlwZSA9PT0gR0xfRkxPQVQgJiYgIWV4dGVuc2lvbnMub2VzX3RleHR1cmVfZmxvYXRfbGluZWFyKSB8fFxuICAgICAgICAodHlwZSA9PT0gR0xfSEFMRl9GTE9BVF9PRVMgJiZcbiAgICAgICAgICAhZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9oYWxmX2Zsb2F0X2xpbmVhcikpIHtcbiAgICAgIFxuICAgIH1cblxuICAgIGZvciAoaSA9IDA7IGkgPCBwaXhlbHMubGVuZ3RoOyArK2kpIHtcbiAgICAgIHBpeG1hcCA9IHBpeGVsc1tpXVxuICAgICAgdmFyIGxldmVsID0gcGl4bWFwLm1pcGxldmVsXG4gICAgICBpZiAocGl4bWFwLndpZHRoKSB7XG4gICAgICAgIFxuICAgICAgfVxuICAgICAgaWYgKHBpeG1hcC5oZWlnaHQpIHtcbiAgICAgICAgXG4gICAgICB9XG4gICAgICBpZiAocGl4bWFwLmNoYW5uZWxzKSB7XG4gICAgICAgIFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGl4bWFwLmNoYW5uZWxzID0gY2hhbm5lbHNcbiAgICAgIH1cbiAgICAgIGlmIChwaXhtYXAuZm9ybWF0KSB7XG4gICAgICAgIFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGl4bWFwLmZvcm1hdCA9IGZvcm1hdFxuICAgICAgfVxuICAgICAgaWYgKHBpeG1hcC5pbnRlcm5hbGZvcm1hdCkge1xuICAgICAgICBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBpeG1hcC5pbnRlcm5hbGZvcm1hdCA9IGludGVybmFsZm9ybWF0XG4gICAgICB9XG4gICAgICBpZiAocGl4bWFwLnR5cGUpIHtcbiAgICAgICAgXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwaXhtYXAudHlwZSA9IHR5cGVcbiAgICAgIH1cbiAgICAgIGlmIChwaXhtYXAuY29weSkge1xuICAgICAgICBcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICB2YXIgYWN0aXZlVGV4dHVyZSA9IDBcbiAgdmFyIHRleHR1cmVDb3VudCA9IDBcbiAgdmFyIHRleHR1cmVTZXQgPSB7fVxuICB2YXIgcG9sbFNldCA9IFtdXG4gIHZhciBudW1UZXhVbml0cyA9IGxpbWl0cy5tYXhUZXh0dXJlVW5pdHNcbiAgdmFyIHRleHR1cmVVbml0cyA9IEFycmF5KG51bVRleFVuaXRzKS5tYXAoZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBudWxsXG4gIH0pXG5cbiAgZnVuY3Rpb24gUkVHTFRleHR1cmUgKHRhcmdldCkge1xuICAgIHRoaXMuaWQgPSB0ZXh0dXJlQ291bnQrK1xuICAgIHRoaXMucmVmQ291bnQgPSAxXG5cbiAgICB0aGlzLnRhcmdldCA9IHRhcmdldFxuICAgIHRoaXMudGV4dHVyZSA9IG51bGxcblxuICAgIHRoaXMucG9sbElkID0gLTFcblxuICAgIHRoaXMudW5pdCA9IC0xXG4gICAgdGhpcy5iaW5kQ291bnQgPSAwXG5cbiAgICAvLyBjYW5jZWxzIGFsbCBwZW5kaW5nIGNhbGxiYWNrc1xuICAgIHRoaXMuY2FuY2VsUGVuZGluZyA9IG51bGxcblxuICAgIC8vIHBhcnNlZCB1c2VyIGlucHV0c1xuICAgIHRoaXMucGFyYW1zID0gbmV3IFRleFBhcmFtcyh0YXJnZXQpXG4gICAgdGhpcy5waXhlbHMgPSBbXVxuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlICh0ZXh0dXJlLCBvcHRpb25zKSB7XG4gICAgdmFyIGlcbiAgICBjbGVhckxpc3RlbmVycyh0ZXh0dXJlKVxuXG4gICAgLy8gQ2xlYXIgcGFyYW1ldGVycyBhbmQgcGl4ZWwgZGF0YVxuICAgIHZhciBwYXJhbXMgPSB0ZXh0dXJlLnBhcmFtc1xuICAgIFRleFBhcmFtcy5jYWxsKHBhcmFtcywgdGV4dHVyZS50YXJnZXQpXG4gICAgdmFyIHBpeGVscyA9IHRleHR1cmUucGl4ZWxzXG4gICAgcGl4ZWxzLmxlbmd0aCA9IDBcblxuICAgIC8vIHBhcnNlIHBhcmFtZXRlcnNcbiAgICBwYXJhbXMucGFyc2Uob3B0aW9ucylcblxuICAgIC8vIHBhcnNlIHBpeGVsIGRhdGFcbiAgICBmdW5jdGlvbiBwYXJzZU1pcCAodGFyZ2V0LCBkYXRhKSB7XG4gICAgICB2YXIgbWlwbWFwID0gZGF0YS5taXBtYXBcbiAgICAgIHZhciBwaXhtYXBcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KG1pcG1hcCkpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtaXBtYXAubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICBwaXhtYXAgPSBuZXcgUGl4ZWxJbmZvKHRhcmdldClcbiAgICAgICAgICBwaXhtYXAucGFyc2VGbGFncyhvcHRpb25zKVxuICAgICAgICAgIHBpeG1hcC5wYXJzZUZsYWdzKGRhdGEpXG4gICAgICAgICAgcGl4bWFwLnBhcnNlKG1pcG1hcFtpXSwgaSlcbiAgICAgICAgICBwaXhlbHMucHVzaChwaXhtYXApXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBpeG1hcCA9IG5ldyBQaXhlbEluZm8odGFyZ2V0KVxuICAgICAgICBwaXhtYXAucGFyc2VGbGFncyhvcHRpb25zKVxuICAgICAgICBwaXhtYXAucGFyc2UoZGF0YSwgMClcbiAgICAgICAgcGl4ZWxzLnB1c2gocGl4bWFwKVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAodGV4dHVyZS50YXJnZXQgPT09IEdMX1RFWFRVUkVfMkQpIHtcbiAgICAgIHBhcnNlTWlwKEdMX1RFWFRVUkVfMkQsIG9wdGlvbnMpXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBmYWNlcyA9IG9wdGlvbnMuZmFjZXMgfHwgb3B0aW9uc1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZmFjZXMpKSB7XG4gICAgICAgIFxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgICAgcGFyc2VNaXAoR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgaSwgZmFjZXNbaV0pXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZhY2VzID09PSAnc3RyaW5nJykge1xuICAgICAgICAvLyBUT0RPIFJlYWQgZGRzXG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBJbml0aWFsaXplIHRvIGFsbCBlbXB0eSB0ZXh0dXJlc1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgICAgcGFyc2VNaXAoR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgaSwge30pXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBkbyBhIHNlY29uZCBwYXNzIHRvIHJlY29uY2lsZSBkZWZhdWx0c1xuICAgIGNoZWNrVGV4dHVyZUNvbXBsZXRlKHBhcmFtcywgcGl4ZWxzKVxuXG4gICAgaWYgKHBhcmFtcy5uZWVkc0xpc3RlbmVycykge1xuICAgICAgaG9va0xpc3RlbmVycyh0ZXh0dXJlKVxuICAgIH1cblxuICAgIGlmIChwYXJhbXMubmVlZHNQb2xsKSB7XG4gICAgICB0ZXh0dXJlLnBvbGxJZCA9IHBvbGxTZXQubGVuZ3RoXG4gICAgICBwb2xsU2V0LnB1c2godGV4dHVyZSlcbiAgICB9XG5cbiAgICByZWZyZXNoKHRleHR1cmUpXG4gIH1cblxuICBmdW5jdGlvbiByZWZyZXNoICh0ZXh0dXJlKSB7XG4gICAgaWYgKCFnbC5pc1RleHR1cmUodGV4dHVyZS50ZXh0dXJlKSkge1xuICAgICAgdGV4dHVyZS50ZXh0dXJlID0gZ2wuY3JlYXRlVGV4dHVyZSgpXG4gICAgfVxuXG4gICAgLy8gTGF6eSBiaW5kXG4gICAgdmFyIHRhcmdldCA9IHRleHR1cmUudGFyZ2V0XG4gICAgdmFyIHVuaXQgPSB0ZXh0dXJlLnVuaXRcbiAgICBpZiAodW5pdCA+PSAwKSB7XG4gICAgICBnbC5hY3RpdmVUZXh0dXJlKEdMX1RFWFRVUkUwICsgdW5pdClcbiAgICAgIGFjdGl2ZVRleHR1cmUgPSB1bml0XG4gICAgfSBlbHNlIHtcbiAgICAgIGdsLmJpbmRUZXh0dXJlKHRhcmdldCwgdGV4dHVyZS50ZXh0dXJlKVxuICAgIH1cblxuICAgIC8vIFVwbG9hZFxuICAgIHZhciBwaXhlbHMgPSB0ZXh0dXJlLnBpeGVsc1xuICAgIHZhciBwYXJhbXMgPSB0ZXh0dXJlLnBhcmFtc1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcGl4ZWxzLmxlbmd0aDsgKytpKSB7XG4gICAgICBwaXhlbHNbaV0udXBsb2FkKHBhcmFtcylcbiAgICB9XG4gICAgcGFyYW1zLnVwbG9hZCgpXG5cbiAgICAvLyBMYXp5IHVuYmluZFxuICAgIGlmICh1bml0IDwgMCkge1xuICAgICAgdmFyIGFjdGl2ZSA9IHRleHR1cmVVbml0c1thY3RpdmVUZXh0dXJlXVxuICAgICAgaWYgKGFjdGl2ZSkge1xuICAgICAgICAvLyByZXN0b3JlIGJpbmRpbmcgc3RhdGVcbiAgICAgICAgZ2wuYmluZFRleHR1cmUoYWN0aXZlLnRhcmdldCwgYWN0aXZlLnRleHR1cmUpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBvdGhlcndpc2UgYmVjb21lIG5ldyBhY3RpdmVcbiAgICAgICAgdGV4dHVyZS51bml0ID0gYWN0aXZlVGV4dHVyZVxuICAgICAgICB0ZXh0dXJlVW5pdHNbYWN0aXZlVGV4dHVyZV0gPSB0ZXh0dXJlXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaG9va0xpc3RlbmVycyAodGV4dHVyZSkge1xuICAgIHZhciBwYXJhbXMgPSB0ZXh0dXJlLnBhcmFtc1xuICAgIHZhciBwaXhlbHMgPSB0ZXh0dXJlLnBpeGVsc1xuXG4gICAgLy8gQXBwZW5kcyBhbGwgdGhlIHRleHR1cmUgZGF0YSBmcm9tIHRoZSBidWZmZXIgdG8gdGhlIGN1cnJlbnRcbiAgICBmdW5jdGlvbiBhcHBlbmRERFMgKHRhcmdldCwgbWlwbGV2ZWwsIGJ1ZmZlcikge1xuICAgICAgdmFyIGRkcyA9IHBhcnNlRERTKGJ1ZmZlcilcblxuICAgICAgXG5cbiAgICAgIGlmIChkZHMuY3ViZSkge1xuICAgICAgICBcblxuICAgICAgICAvLyBUT0RPIGhhbmRsZSBjdWJlIG1hcCBERFNcbiAgICAgICAgXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcbiAgICAgIH1cblxuICAgICAgaWYgKG1pcGxldmVsKSB7XG4gICAgICAgIFxuICAgICAgfVxuXG4gICAgICBkZHMucGl4ZWxzLmZvckVhY2goZnVuY3Rpb24gKHBpeG1hcCkge1xuICAgICAgICB2YXIgaW5mbyA9IG5ldyBQaXhlbEluZm8oZGRzLmN1YmUgPyBwaXhtYXAudGFyZ2V0IDogdGFyZ2V0KVxuXG4gICAgICAgIGluZm8uY2hhbm5lbHMgPSBkZHMuY2hhbm5lbHNcbiAgICAgICAgaW5mby5jb21wcmVzc2VkID0gZGRzLmNvbXByZXNzZWRcbiAgICAgICAgaW5mby50eXBlID0gZGRzLnR5cGVcbiAgICAgICAgaW5mby5pbnRlcm5hbGZvcm1hdCA9IGRkcy5mb3JtYXRcbiAgICAgICAgaW5mby5mb3JtYXQgPSBjb2xvckZvcm1hdHNbZGRzLmZvcm1hdF1cblxuICAgICAgICBpbmZvLndpZHRoID0gcGl4bWFwLndpZHRoXG4gICAgICAgIGluZm8uaGVpZ2h0ID0gcGl4bWFwLmhlaWdodFxuICAgICAgICBpbmZvLm1pcGxldmVsID0gcGl4bWFwLm1pcGxldmVsIHx8IG1pcGxldmVsXG4gICAgICAgIGluZm8uZGF0YSA9IHBpeG1hcC5kYXRhXG5cbiAgICAgICAgcGl4ZWxzLnB1c2goaW5mbylcbiAgICAgIH0pXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb25EYXRhICgpIHtcbiAgICAgIC8vIFVwZGF0ZSBzaXplIG9mIGFueSBuZXdseSBsb2FkZWQgcGl4ZWxzXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHBpeGVscy5sZW5ndGg7ICsraSkge1xuICAgICAgICB2YXIgcGl4ZWxEYXRhID0gcGl4ZWxzW2ldXG4gICAgICAgIHZhciBpbWFnZSA9IHBpeGVsRGF0YS5pbWFnZVxuICAgICAgICB2YXIgdmlkZW8gPSBwaXhlbERhdGEudmlkZW9cbiAgICAgICAgdmFyIHhociA9IHBpeGVsRGF0YS54aHJcbiAgICAgICAgaWYgKGltYWdlICYmIGltYWdlLmNvbXBsZXRlKSB7XG4gICAgICAgICAgcGl4ZWxEYXRhLndpZHRoID0gaW1hZ2UubmF0dXJhbFdpZHRoXG4gICAgICAgICAgcGl4ZWxEYXRhLmhlaWdodCA9IGltYWdlLm5hdHVyYWxIZWlnaHRcbiAgICAgICAgfSBlbHNlIGlmICh2aWRlbyAmJiB2aWRlby5yZWFkeVN0YXRlID4gMikge1xuICAgICAgICAgIHBpeGVsRGF0YS53aWR0aCA9IHZpZGVvLndpZHRoXG4gICAgICAgICAgcGl4ZWxEYXRhLmhlaWdodCA9IHZpZGVvLmhlaWdodFxuICAgICAgICB9IGVsc2UgaWYgKHhociAmJiB4aHIucmVhZHlTdGF0ZSA9PT0gNCkge1xuICAgICAgICAgIHBpeGVsc1tpXSA9IHBpeGVsc1twaXhlbHMubGVuZ3RoIC0gMV1cbiAgICAgICAgICBwaXhlbHMucG9wKClcbiAgICAgICAgICB4aHIucmVtb3ZlRXZlbnRMaXN0ZW5lcigncmVhZHlzdGF0ZWNoYW5nZScsIHJlZnJlc2gpXG4gICAgICAgICAgYXBwZW5kRERTKHBpeGVsRGF0YS50YXJnZXQsIHBpeGVsRGF0YS5taXBsZXZlbCwgeGhyLnJlc3BvbnNlKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjaGVja1RleHR1cmVDb21wbGV0ZShwYXJhbXMsIHBpeGVscylcbiAgICAgIHJlZnJlc2godGV4dHVyZSlcbiAgICB9XG5cbiAgICBwaXhlbHMuZm9yRWFjaChmdW5jdGlvbiAocGl4ZWxEYXRhKSB7XG4gICAgICBpZiAocGl4ZWxEYXRhLmltYWdlICYmICFwaXhlbERhdGEuaW1hZ2UuY29tcGxldGUpIHtcbiAgICAgICAgcGl4ZWxEYXRhLmltYWdlLmFkZEV2ZW50TGlzdGVuZXIoJ2xvYWQnLCBvbkRhdGEpXG4gICAgICB9IGVsc2UgaWYgKHBpeGVsRGF0YS52aWRlbyAmJiBwaXhlbERhdGEucmVhZHlTdGF0ZSA8IDEpIHtcbiAgICAgICAgcGl4ZWxEYXRhLnZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3Byb2dyZXNzJywgb25EYXRhKVxuICAgICAgfSBlbHNlIGlmIChwaXhlbERhdGEueGhyKSB7XG4gICAgICAgIHBpeGVsRGF0YS54aHIuYWRkRXZlbnRMaXN0ZW5lcigncmVhZHlzdGF0ZWNoYW5nZScsIG9uRGF0YSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgdGV4dHVyZS5jYW5jZWxQZW5kaW5nID0gZnVuY3Rpb24gZGV0YWNoTGlzdGVuZXJzICgpIHtcbiAgICAgIHBpeGVscy5mb3JFYWNoKGZ1bmN0aW9uIChwaXhlbERhdGEpIHtcbiAgICAgICAgaWYgKHBpeGVsRGF0YS5pbWFnZSkge1xuICAgICAgICAgIHBpeGVsRGF0YS5pbWFnZS5yZW1vdmVFdmVudExpc3RlbmVyKCdsb2FkJywgb25EYXRhKVxuICAgICAgICB9IGVsc2UgaWYgKHBpeGVsRGF0YS52aWRlbykge1xuICAgICAgICAgIHBpeGVsRGF0YS52aWRlby5yZW1vdmVFdmVudExpc3RlbmVyKCdwcm9ncmVzcycsIG9uRGF0YSlcbiAgICAgICAgfSBlbHNlIGlmIChwaXhlbERhdGEueGhyKSB7XG4gICAgICAgICAgcGl4ZWxEYXRhLnhoci5yZW1vdmVFdmVudExpc3RlbmVyKCdyZWFkeXN0YXRlY2hhbmdlJywgb25EYXRhKVxuICAgICAgICAgIHBpeGVsRGF0YS54aHIuYWJvcnQoKVxuICAgICAgICB9XG4gICAgICB9KVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFyTGlzdGVuZXJzICh0ZXh0dXJlKSB7XG4gICAgdmFyIGNhbmNlbFBlbmRpbmcgPSB0ZXh0dXJlLmNhbmNlbFBlbmRpbmdcbiAgICBpZiAoY2FuY2VsUGVuZGluZykge1xuICAgICAgY2FuY2VsUGVuZGluZygpXG4gICAgICB0ZXh0dXJlLmNhbmNlbFBlbmRpbmcgPSBudWxsXG4gICAgfVxuICAgIHZhciBpZCA9IHRleHR1cmUucG9sbElkXG4gICAgaWYgKGlkID49IDApIHtcbiAgICAgIHZhciBvdGhlciA9IHBvbGxTZXRbaWRdID0gcG9sbFNldFtwb2xsU2V0Lmxlbmd0aCAtIDFdXG4gICAgICBvdGhlci5pZCA9IGlkXG4gICAgICBwb2xsU2V0LnBvcCgpXG4gICAgICB0ZXh0dXJlLnBvbGxJZCA9IC0xXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAodGV4dHVyZSkge1xuICAgIHZhciBoYW5kbGUgPSB0ZXh0dXJlLnRleHR1cmVcbiAgICBcbiAgICB2YXIgdW5pdCA9IHRleHR1cmUudW5pdFxuICAgIHZhciB0YXJnZXQgPSB0ZXh0dXJlLnRhcmdldFxuICAgIGlmICh1bml0ID49IDApIHtcbiAgICAgIGdsLmFjdGl2ZVRleHR1cmUoR0xfVEVYVFVSRTAgKyB1bml0KVxuICAgICAgYWN0aXZlVGV4dHVyZSA9IHVuaXRcbiAgICAgIGdsLmJpbmRUZXh0dXJlKHRhcmdldCwgbnVsbClcbiAgICAgIHRleHR1cmVVbml0c1t1bml0XSA9IG51bGxcbiAgICB9XG4gICAgY2xlYXJMaXN0ZW5lcnModGV4dHVyZSlcbiAgICBpZiAoZ2wuaXNUZXh0dXJlKGhhbmRsZSkpIHtcbiAgICAgIGdsLmRlbGV0ZVRleHR1cmUoaGFuZGxlKVxuICAgIH1cbiAgICB0ZXh0dXJlLnRleHR1cmUgPSBudWxsXG4gICAgdGV4dHVyZS5wYXJhbXMgPSBudWxsXG4gICAgdGV4dHVyZS5waXhlbHMgPSBudWxsXG4gICAgdGV4dHVyZS5yZWZDb3VudCA9IDBcbiAgICBkZWxldGUgdGV4dHVyZVNldFt0ZXh0dXJlLmlkXVxuICB9XG5cbiAgZXh0ZW5kKFJFR0xUZXh0dXJlLnByb3RvdHlwZSwge1xuICAgIGJpbmQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciB0ZXh0dXJlID0gdGhpc1xuICAgICAgdGV4dHVyZS5iaW5kQ291bnQgKz0gMVxuICAgICAgdmFyIHVuaXQgPSB0ZXh0dXJlLnVuaXRcbiAgICAgIGlmICh1bml0IDwgMCkge1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG51bVRleFVuaXRzOyArK2kpIHtcbiAgICAgICAgICB2YXIgb3RoZXIgPSB0ZXh0dXJlVW5pdHNbaV1cbiAgICAgICAgICBpZiAob3RoZXIpIHtcbiAgICAgICAgICAgIGlmIChvdGhlci5iaW5kQ291bnQgPiAwKSB7XG4gICAgICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBvdGhlci51bml0ID0gLTFcbiAgICAgICAgICB9XG4gICAgICAgICAgdGV4dHVyZVVuaXRzW2ldID0gdGV4dHVyZVxuICAgICAgICAgIHVuaXQgPSBpXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgfVxuICAgICAgICBpZiAodW5pdCA+PSBudW1UZXhVbml0cykge1xuICAgICAgICAgIFxuICAgICAgICB9XG4gICAgICAgIHRleHR1cmUudW5pdCA9IHVuaXRcbiAgICAgICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMCArIHVuaXQpXG4gICAgICAgIGdsLmJpbmRUZXh0dXJlKHRleHR1cmUudGFyZ2V0LCB0ZXh0dXJlLnRleHR1cmUpXG4gICAgICAgIGFjdGl2ZVRleHR1cmUgPSB1bml0XG4gICAgICB9XG4gICAgICByZXR1cm4gdW5pdFxuICAgIH0sXG5cbiAgICB1bmJpbmQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRoaXMuYmluZENvdW50IC09IDFcbiAgICB9LFxuXG4gICAgZGVjUmVmOiBmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAoLS10aGlzLnJlZkNvdW50ID09PSAwKSB7XG4gICAgICAgIGRlc3Ryb3kodGhpcylcbiAgICAgIH1cbiAgICB9XG4gIH0pXG5cbiAgZnVuY3Rpb24gY3JlYXRlVGV4dHVyZSAob3B0aW9ucywgdGFyZ2V0KSB7XG4gICAgdmFyIHRleHR1cmUgPSBuZXcgUkVHTFRleHR1cmUodGFyZ2V0KVxuICAgIHRleHR1cmVTZXRbdGV4dHVyZS5pZF0gPSB0ZXh0dXJlXG5cbiAgICBmdW5jdGlvbiByZWdsVGV4dHVyZSAoYTAsIGExLCBhMiwgYTMsIGE0LCBhNSkge1xuICAgICAgdmFyIG9wdGlvbnMgPSBhMCB8fCB7fVxuICAgICAgaWYgKHRhcmdldCA9PT0gR0xfVEVYVFVSRV9DVUJFX01BUCAmJiBhcmd1bWVudHMubGVuZ3RoID09PSA2KSB7XG4gICAgICAgIG9wdGlvbnMgPSBbYTAsIGExLCBhMiwgYTMsIGE0LCBhNV1cbiAgICAgIH1cbiAgICAgIHVwZGF0ZSh0ZXh0dXJlLCBvcHRpb25zKVxuICAgICAgcmVnbFRleHR1cmUud2lkdGggPSB0ZXh0dXJlLnBhcmFtcy53aWR0aFxuICAgICAgcmVnbFRleHR1cmUuaGVpZ2h0ID0gdGV4dHVyZS5wYXJhbXMuaGVpZ2h0XG4gICAgICByZXR1cm4gcmVnbFRleHR1cmVcbiAgICB9XG5cbiAgICByZWdsVGV4dHVyZShvcHRpb25zKVxuXG4gICAgcmVnbFRleHR1cmUuX3JlZ2xUeXBlID0gJ3RleHR1cmUnXG4gICAgcmVnbFRleHR1cmUuX3RleHR1cmUgPSB0ZXh0dXJlXG4gICAgcmVnbFRleHR1cmUuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRleHR1cmUuZGVjUmVmKClcbiAgICB9XG4gIFxuICAgIHJldHVybiByZWdsVGV4dHVyZVxuICB9XG5cbiAgLy8gQ2FsbGVkIGFmdGVyIGNvbnRleHQgcmVzdG9yZVxuICBmdW5jdGlvbiByZWZyZXNoVGV4dHVyZXMgKCkge1xuICAgIHZhbHVlcyh0ZXh0dXJlU2V0KS5mb3JFYWNoKHJlZnJlc2gpXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW1UZXhVbml0czsgKytpKSB7XG4gICAgICB0ZXh0dXJlVW5pdHNbaV0gPSBudWxsXG4gICAgfVxuICAgIGFjdGl2ZVRleHR1cmUgPSAwXG4gICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMClcbiAgfVxuXG4gIC8vIENhbGxlZCB3aGVuIHJlZ2wgaXMgZGVzdHJveWVkXG4gIGZ1bmN0aW9uIGRlc3Ryb3lUZXh0dXJlcyAoKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW1UZXhVbml0czsgKytpKSB7XG4gICAgICBnbC5hY3RpdmVUZXh0dXJlKEdMX1RFWFRVUkUwICsgaSlcbiAgICAgIGdsLmJpbmRUZXh0dXJlKEdMX1RFWFRVUkVfMkQsIG51bGwpXG4gICAgICB0ZXh0dXJlVW5pdHNbaV0gPSBudWxsXG4gICAgfVxuICAgIGdsLmFjdGl2ZVRleHR1cmUoR0xfVEVYVFVSRTApXG4gICAgYWN0aXZlVGV4dHVyZSA9IDBcbiAgICB2YWx1ZXModGV4dHVyZVNldCkuZm9yRWFjaChkZXN0cm95KVxuICB9XG5cbiAgLy8gQ2FsbGVkIG9uY2UgcGVyIHJhZiwgdXBkYXRlcyB2aWRlbyB0ZXh0dXJlc1xuICBmdW5jdGlvbiBwb2xsVGV4dHVyZXMgKCkge1xuICAgIHBvbGxTZXQuZm9yRWFjaChyZWZyZXNoKVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjcmVhdGU6IGNyZWF0ZVRleHR1cmUsXG4gICAgcmVmcmVzaDogcmVmcmVzaFRleHR1cmVzLFxuICAgIGNsZWFyOiBkZXN0cm95VGV4dHVyZXMsXG4gICAgcG9sbDogcG9sbFRleHR1cmVzLFxuICAgIGdldFRleHR1cmU6IGZ1bmN0aW9uICh3cmFwcGVyKSB7XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjb252ZXJ0VG9IYWxmRmxvYXQgKGFycmF5KSB7XG4gIHZhciBmbG9hdHMgPSBuZXcgRmxvYXQzMkFycmF5KGFycmF5KVxuICB2YXIgdWludHMgPSBuZXcgVWludDMyQXJyYXkoZmxvYXRzLmJ1ZmZlcilcbiAgdmFyIHVzaG9ydHMgPSBuZXcgVWludDE2QXJyYXkoYXJyYXkubGVuZ3RoKVxuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYXJyYXkubGVuZ3RoOyArK2kpIHtcbiAgICBpZiAoaXNOYU4oYXJyYXlbaV0pKSB7XG4gICAgICB1c2hvcnRzW2ldID0gMHhmZmZmXG4gICAgfSBlbHNlIGlmIChhcnJheVtpXSA9PT0gSW5maW5pdHkpIHtcbiAgICAgIHVzaG9ydHNbaV0gPSAweDdjMDBcbiAgICB9IGVsc2UgaWYgKGFycmF5W2ldID09PSAtSW5maW5pdHkpIHtcbiAgICAgIHVzaG9ydHNbaV0gPSAweGZjMDBcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIHggPSB1aW50c1tpXVxuXG4gICAgICB2YXIgc2duID0gKHggPj4+IDMxKSA8PCAxNVxuICAgICAgdmFyIGV4cCA9ICgoeCA8PCAxKSA+Pj4gMjQpIC0gMTI3XG4gICAgICB2YXIgZnJhYyA9ICh4ID4+IDEzKSAmICgoMSA8PCAxMCkgLSAxKVxuXG4gICAgICBpZiAoZXhwIDwgLTI0KSB7XG4gICAgICAgIC8vIHJvdW5kIG5vbi1yZXByZXNlbnRhYmxlIGRlbm9ybWFscyB0byAwXG4gICAgICAgIHVzaG9ydHNbaV0gPSBzZ25cbiAgICAgIH0gZWxzZSBpZiAoZXhwIDwgLTE0KSB7XG4gICAgICAgIC8vIGhhbmRsZSBkZW5vcm1hbHNcbiAgICAgICAgdmFyIHMgPSAtMTQgLSBleHBcbiAgICAgICAgdXNob3J0c1tpXSA9IHNnbiArICgoZnJhYyArICgxIDw8IDEwKSkgPj4gcylcbiAgICAgIH0gZWxzZSBpZiAoZXhwID4gMTUpIHtcbiAgICAgICAgLy8gcm91bmQgb3ZlcmZsb3cgdG8gKy8tIEluZmluaXR5XG4gICAgICAgIHVzaG9ydHNbaV0gPSBzZ24gKyAweDdjMDBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIG90aGVyd2lzZSBjb252ZXJ0IGRpcmVjdGx5XG4gICAgICAgIHVzaG9ydHNbaV0gPSBzZ24gKyAoKGV4cCArIDE1KSA8PCAxMCkgKyBmcmFjXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHVzaG9ydHNcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcFVuaWZvcm1TdGF0ZSAoc3RyaW5nU3RvcmUpIHtcbiAgdmFyIHVuaWZvcm1TdGF0ZSA9IHt9XG5cbiAgZnVuY3Rpb24gZGVmVW5pZm9ybSAobmFtZSkge1xuICAgIHZhciBpZCA9IHN0cmluZ1N0b3JlLmlkKG5hbWUpXG4gICAgdmFyIHJlc3VsdCA9IHVuaWZvcm1TdGF0ZVtpZF1cbiAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgcmVzdWx0ID0gdW5pZm9ybVN0YXRlW2lkXSA9IFtcbiAgICAgICAgWzAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDBdXG4gICAgICBdXG4gICAgfVxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgZGVmOiBkZWZVbmlmb3JtXG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKG9iaikge1xuICByZXR1cm4gT2JqZWN0LmtleXMob2JqKS5tYXAoZnVuY3Rpb24gKGtleSkgeyByZXR1cm4gb2JqW2tleV0gfSlcbn1cbiIsIid1c2Ugc3RyaWN0J1xuXG5tb2R1bGUuZXhwb3J0cyA9IGFuZ2xlTm9ybWFsc1xuXG5mdW5jdGlvbiBoeXBvdCh4LCB5LCB6KSB7XG4gIHJldHVybiBNYXRoLnNxcnQoTWF0aC5wb3coeCwyKSArIE1hdGgucG93KHksMikgKyBNYXRoLnBvdyh6LDIpKVxufVxuXG5mdW5jdGlvbiB3ZWlnaHQocywgciwgYSkge1xuICByZXR1cm4gTWF0aC5hdGFuMihyLCAocyAtIGEpKVxufVxuXG5mdW5jdGlvbiBtdWxBZGQoZGVzdCwgcywgeCwgeSwgeikge1xuICBkZXN0WzBdICs9IHMgKiB4XG4gIGRlc3RbMV0gKz0gcyAqIHlcbiAgZGVzdFsyXSArPSBzICogelxufVxuXG5mdW5jdGlvbiBhbmdsZU5vcm1hbHMoY2VsbHMsIHBvc2l0aW9ucykge1xuICB2YXIgbnVtVmVydHMgPSBwb3NpdGlvbnMubGVuZ3RoXG4gIHZhciBudW1DZWxscyA9IGNlbGxzLmxlbmd0aFxuXG4gIC8vQWxsb2NhdGUgbm9ybWFsIGFycmF5XG4gIHZhciBub3JtYWxzID0gbmV3IEFycmF5KG51bVZlcnRzKVxuICBmb3IodmFyIGk9MDsgaTxudW1WZXJ0czsgKytpKSB7XG4gICAgbm9ybWFsc1tpXSA9IFswLDAsMF1cbiAgfVxuXG4gIC8vU2NhbiBjZWxscywgYW5kXG4gIGZvcih2YXIgaT0wOyBpPG51bUNlbGxzOyArK2kpIHtcbiAgICB2YXIgY2VsbCA9IGNlbGxzW2ldXG4gICAgdmFyIGEgPSBwb3NpdGlvbnNbY2VsbFswXV1cbiAgICB2YXIgYiA9IHBvc2l0aW9uc1tjZWxsWzFdXVxuICAgIHZhciBjID0gcG9zaXRpb25zW2NlbGxbMl1dXG5cbiAgICB2YXIgYWJ4ID0gYVswXSAtIGJbMF1cbiAgICB2YXIgYWJ5ID0gYVsxXSAtIGJbMV1cbiAgICB2YXIgYWJ6ID0gYVsyXSAtIGJbMl1cbiAgICB2YXIgYWIgPSBoeXBvdChhYngsIGFieSwgYWJ6KVxuXG4gICAgdmFyIGJjeCA9IGJbMF0gLSBjWzBdXG4gICAgdmFyIGJjeSA9IGJbMV0gLSBjWzFdXG4gICAgdmFyIGJjeiA9IGJbMl0gLSBjWzJdXG4gICAgdmFyIGJjID0gaHlwb3QoYmN4LCBiY3ksIGJjeilcblxuICAgIHZhciBjYXggPSBjWzBdIC0gYVswXVxuICAgIHZhciBjYXkgPSBjWzFdIC0gYVsxXVxuICAgIHZhciBjYXogPSBjWzJdIC0gYVsyXVxuICAgIHZhciBjYSA9IGh5cG90KGNheCwgY2F5LCBjYXopXG5cbiAgICBpZihNYXRoLm1pbihhYiwgYmMsIGNhKSA8IDFlLTYpIHtcbiAgICAgIGNvbnRpbnVlXG4gICAgfVxuXG4gICAgdmFyIHMgPSAwLjUgKiAoYWIgKyBiYyArIGNhKVxuICAgIHZhciByID0gTWF0aC5zcXJ0KChzIC0gYWIpKihzIC0gYmMpKihzIC0gY2EpL3MpXG5cbiAgICB2YXIgbnggPSBhYnkgKiBiY3ogLSBhYnogKiBiY3lcbiAgICB2YXIgbnkgPSBhYnogKiBiY3ggLSBhYnggKiBiY3pcbiAgICB2YXIgbnogPSBhYnggKiBiY3kgLSBhYnkgKiBiY3hcbiAgICB2YXIgbmwgPSBoeXBvdChueCwgbnksIG56KVxuICAgIG54IC89IG5sXG4gICAgbnkgLz0gbmxcbiAgICBueiAvPSBubFxuXG4gICAgbXVsQWRkKG5vcm1hbHNbY2VsbFswXV0sIHdlaWdodChzLCByLCBiYyksIG54LCBueSwgbnopXG4gICAgbXVsQWRkKG5vcm1hbHNbY2VsbFsxXV0sIHdlaWdodChzLCByLCBjYSksIG54LCBueSwgbnopXG4gICAgbXVsQWRkKG5vcm1hbHNbY2VsbFsyXV0sIHdlaWdodChzLCByLCBhYiksIG54LCBueSwgbnopXG4gIH1cblxuICAvL05vcm1hbGl6ZSBhbGwgdGhlIG5vcm1hbHNcbiAgZm9yKHZhciBpPTA7IGk8bnVtVmVydHM7ICsraSkge1xuICAgIHZhciBuID0gbm9ybWFsc1tpXVxuICAgIHZhciBsID0gTWF0aC5zcXJ0KFxuICAgICAgTWF0aC5wb3coblswXSwgMikgK1xuICAgICAgTWF0aC5wb3coblsxXSwgMikgK1xuICAgICAgTWF0aC5wb3coblsyXSwgMikpXG4gICAgaWYobCA8IDFlLTgpIHtcbiAgICAgIG5bMF0gPSAxXG4gICAgICBuWzFdID0gMFxuICAgICAgblsyXSA9IDBcbiAgICAgIGNvbnRpbnVlXG4gICAgfVxuICAgIG5bMF0gLz0gbFxuICAgIG5bMV0gLz0gbFxuICAgIG5bMl0gLz0gbFxuICB9XG5cbiAgcmV0dXJuIG5vcm1hbHNcbn1cbiIsImV4cG9ydHMucG9zaXRpb25zPVtbMS4zMDE4OTUsMC4xMjI2MjIsMi41NTAwNjFdLFsxLjA0NTMyNiwwLjEzOTA1OCwyLjgzNTE1Nl0sWzAuNTY5MjUxLDAuMTU1OTI1LDIuODA1MTI1XSxbMC4yNTE4ODYsMC4xNDQxNDUsMi44MjkyOF0sWzAuMDYzMDMzLDAuMTMxNzI2LDMuMDE0MDhdLFstMC4yNzc3NTMsMC4xMzU4OTIsMy4xMDcxNl0sWy0wLjQ0MTA0OCwwLjI3NzA2NCwyLjU5NDMzMV0sWy0xLjAxMDk1NiwwLjA5NTI4NSwyLjY2ODk4M10sWy0xLjMxNzYzOSwwLjA2OTg5NywyLjMyNTQ0OF0sWy0wLjc1MTY5MSwwLjI2NDY4MSwyLjM4MTQ5Nl0sWzAuNjg0MTM3LDAuMzExMzQsMi4zNjQ1NzRdLFsxLjM0NzkzMSwwLjMwMjg4MiwyLjIwMTQzNF0sWy0xLjczNjkwMywwLjAyOTg5NCwxLjcyNDExMV0sWy0xLjMxOTk4NiwwLjExOTk4LDAuOTEyOTI1XSxbMS41MzgwNzcsMC4xNTczNzIsMC40ODE3MTFdLFsxLjk1MTk3NSwwLjA4MTc0MiwxLjE2NDFdLFsxLjgzNDc2OCwwLjA5NTgzMiwxLjYwMjY4Ml0sWzIuNDQ2MTIyLDAuMDkxODE3LDEuMzc1NThdLFsyLjYxNzYxNSwwLjA3ODY0NCwwLjc0MjgwMV0sWy0xLjYwOTc0OCwwLjA0OTczLC0wLjIzODcyMV0sWy0xLjI4MTk3MywwLjIzMDk4NCwtMC4xODA5MTZdLFstMS4wNzQ1MDEsMC4yNDgyMDQsMC4wMzQwMDddLFstMS4yMDE3MzQsMC4wNTg0OTksMC40MDIyMzRdLFstMS40NDQ0NTQsMC4wNTQ3ODMsMC4xNDk1NzldLFstNC42OTQ2MDUsNS4wNzU4ODIsMS4wNDM0MjddLFstMy45NTk2Myw3Ljc2NzM5NCwwLjc1ODQ0N10sWy00Ljc1MzMzOSw1LjMzOTgxNywwLjY2NTA2MV0sWy0xLjE1MDMyNSw5LjEzMzMyNywtMC4zNjg1NTJdLFstNC4zMTYxMDcsMi44OTM2MTEsMC40NDM5OV0sWy0wLjgwOTIwMiw5LjMxMjU3NSwtMC40NjYwNjFdLFswLjA4NTYyNiw1Ljk2MzY5MywxLjY4NTY2Nl0sWy0xLjMxNDg1Myw5LjAwMTQyLC0wLjEzMzldLFstNC4zNjQxODIsMy4wNzI1NTYsMS40MzY3MTJdLFstMi4wMjIwNzQsNy4zMjMzOTYsMC42Nzg2NTddLFsxLjk5MDg4Nyw2LjEzMDIzLDAuNDc5NjQzXSxbLTMuMjk1NTI1LDcuODc4OTE3LDEuNDA5MzUzXSxbMC41NzEzMDgsNi4xOTc1NjksMC42NzA2NTddLFswLjg5NjYxLDYuMjAwMTgsMC4zMzcwNTZdLFswLjMzMTg1MSw2LjE2MjM3MiwxLjE4NjM3MV0sWy00Ljg0MDA2Niw1LjU5OTg3NCwyLjI5NjA2OV0sWzIuMTM4OTg5LDYuMDMxMjkxLDAuMjI4MzM1XSxbMC42Nzg5MjMsNi4wMjYxNzMsMS44OTQwNTJdLFstMC43ODE2ODIsNS42MDE1NzMsMS44MzY3MzhdLFsxLjE4MTMxNSw2LjIzOTAwNywwLjM5MzI5M10sWy0zLjYwNjMwOCw3LjM3NjQ3NiwyLjY2MTQ1Ml0sWy0wLjU3OTA1OSw0LjA0MjUxMSwtMS41NDA4ODNdLFstMy4wNjQwNjksOC42MzAyNTMsLTIuNTk3NTM5XSxbLTIuMTU3MjcxLDYuODM3MDEyLDAuMzAwMTkxXSxbLTIuOTY2MDEzLDcuODIxNTgxLC0xLjEzNjk3XSxbLTIuMzQ0MjYsOC4xMjI5NjUsMC40MDkwNDNdLFstMC45NTE2ODQsNS44NzQyNTEsMS40MTUxMTldLFstMi44MzQ4NTMsNy43NDgzMTksMC4xODI0MDZdLFstMy4yNDI0OTMsNy44MjAwOTYsMC4zNzM2NzRdLFstMC4yMDg1MzIsNS45OTI4NDYsMS4yNTIwODRdLFstMy4wNDgwODUsOC40MzE1MjcsLTIuMTI5Nzk1XSxbMS40MTMyNDUsNS44MDYzMjQsMi4yNDM5MDZdLFstMC4wNTEyMjIsNi4wNjQ5MDEsMC42OTYwOTNdLFstNC4yMDQzMDYsMi43MDAwNjIsMC43MTM4NzVdLFstNC42MTA5OTcsNi4zNDM0MDUsMC4zNDQyNzJdLFstMy4yOTEzMzYsOS4zMDUzMSwtMy4zNDA0NDVdLFstMy4yNzIxMSw3LjU1OTIzOSwtMi4zMjQwMTZdLFstNC4yMzg4Miw2LjQ5ODM0NCwzLjE4NDUyXSxbLTMuOTQ1MzE3LDYuMzc3ODA0LDMuMzg2MjVdLFstNC45MDYzNzgsNS40NzIyNjUsMS4zMTUxOTNdLFstMy41ODAxMzEsNy44NDY3MTcsMC43MDk2NjZdLFstMS45OTU1MDQsNi42NDU0NTksMC42ODg0ODddLFstMi41OTU2NTEsNy44NjA1NCwwLjc5MzM1MV0sWy0wLjAwODg0OSwwLjMwNTg3MSwwLjE4NDQ4NF0sWy0wLjAyOTAxMSwwLjMxNDExNiwtMC4yNTczMTJdLFstMi41MjI0MjQsNy41NjUzOTIsMS44MDQyMTJdLFstMS4wMjI5OTMsOC42NTA4MjYsLTAuODU1NjA5XSxbLTMuODMxMjY1LDYuNTk1NDI2LDMuMjY2NzgzXSxbLTQuMDQyNTI1LDYuODU1NzI0LDMuMDYwNjYzXSxbLTQuMTcxMjYsNy40MDQ3NDIsMi4zOTEzODddLFszLjkwNDUyNiwzLjc2NzY5MywwLjA5MjE3OV0sWzAuMjY4MDc2LDYuMDg2ODAyLDEuNDY5MjIzXSxbLTMuMzIwNDU2LDguNzUzMjIyLC0yLjA4OTY5XSxbMS4yMDMwNDgsNi4yNjkyNSwwLjYxMjQwN10sWy00LjQwNjQ3OSwyLjk4NTk3NCwwLjg1MzY5MV0sWy0zLjIyNjg4OSw2LjYxNTIxNSwtMC40MDQyNDNdLFswLjM0NjMyNiwxLjYwMjExLDMuNTA5ODU4XSxbLTMuOTU1NDc2LDcuMjUzMzIzLDIuNzIyMzkyXSxbLTEuMjMyMDQsMC4wNjg5MzUsMS42ODc5NF0sWzAuNjI1NDM2LDYuMTk2NDU1LDEuMzMzMTU2XSxbNC40NjkxMzIsMi4xNjUyOTgsMS43MDUyNV0sWzAuOTUwMDUzLDYuMjYyODk5LDAuOTIyNDQxXSxbLTIuOTgwNDA0LDUuMjU0NzQsLTAuNjYzMTU1XSxbLTQuODU5MDQzLDYuMjg3NDEsMS41MzcwODFdLFstMy4wNzc0NTMsNC42NDE0NzUsLTAuODkyMTY3XSxbLTAuNDQwMDIsOC4yMjI1MDMsLTAuNzcxNDU0XSxbLTQuMDM0MTEyLDcuNjM5Nzg2LDAuMzg5OTM1XSxbLTMuNjk2MDQ1LDYuMjQyMDQyLDMuMzk0Njc5XSxbLTEuMjIxODA2LDcuNzgzNjE3LDAuMTk2NDUxXSxbMC43MTQ2MSw2LjE0OTg5NSwxLjY1NjYzNl0sWy00LjcxMzUzOSw2LjE2MzE1NCwwLjQ5NTM2OV0sWy0xLjUwOTg2OSwwLjkxMzA0NCwtMC44MzI0MTNdLFstMS41NDcyNDksMi4wNjY3NTMsLTAuODUyNjY5XSxbLTMuNzU3NzM0LDUuNzkzNzQyLDMuNDU1Nzk0XSxbLTAuODMxOTExLDAuMTk5Mjk2LDEuNzE4NTM2XSxbLTMuMDYyNzYzLDcuNTI3MTgsLTEuNTUwNTU5XSxbMC45Mzg2ODgsNi4xMDMzNTQsMS44MjA5NThdLFstNC4wMzcwMzMsMi40MTIzMTEsMC45ODgwMjZdLFstNC4xMzA3NDYsMi41NzE4MDYsMS4xMDE2ODldLFstMC42OTM2NjQsOS4xNzQyODMsLTAuOTUyMzIzXSxbLTEuMjg2NzQyLDEuMDc5Njc5LC0wLjc1MTIxOV0sWzEuNTQzMTg1LDEuNDA4OTI1LDMuNDgzMTMyXSxbMS41MzU5NzMsMi4wNDc5NzksMy42NTUwMjldLFswLjkzODQ0LDUuODQxMDEsMi4xOTUyMTldLFstMC42ODQ0MDEsNS45MTg0OTIsMS4yMDEwOV0sWzEuMjg4NDQsMi4wMDg2NzYsMy43MTA3ODFdLFstMy41ODY3MjIsNy40MzU1MDYsLTEuNDU0NzM3XSxbLTAuMTI5OTc1LDQuMzg0MTkyLDIuOTMwNTkzXSxbLTEuMDMwNTMxLDAuMjgxMzc0LDMuMjE0MjczXSxbLTMuMDU4NzUxLDguMTM3MjM4LC0zLjIyNzcxNF0sWzMuNjQ5NTI0LDQuNTkyMjI2LDEuMzQwMDIxXSxbLTMuMzU0ODI4LDcuMzIyNDI1LC0xLjQxMjA4Nl0sWzAuOTM2NDQ5LDYuMjA5MjM3LDEuNTEyNjkzXSxbLTEuMDAxODMyLDMuNTkwNDExLC0xLjU0NTg5Ml0sWy0zLjc3MDQ4Niw0LjU5MzI0MiwyLjQ3NzA1Nl0sWy0wLjk3MTkyNSwwLjA2Nzc5NywwLjkyMTM4NF0sWy00LjYzOTgzMiw2Ljg2NTQwNywyLjMxMTc5MV0sWy0wLjQ0MTAxNCw4LjA5MzU5NSwtMC41OTU5OTldLFstMi4wMDQ4NTIsNi4zNzE0MiwxLjYzNTM4M10sWzQuNzU5NTkxLDEuOTI4MTgsMC4zMjgzMjhdLFszLjc0ODA2NCwxLjIyNDA3NCwyLjE0MDQ4NF0sWy0wLjcwMzYwMSw1LjI4NTQ3NiwyLjI1MTk4OF0sWzAuNTk1MzIsNi4yMTg5MywwLjk4MTAwNF0sWzAuOTgwNzk5LDYuMjU3MDI2LDEuMjQyMjNdLFsxLjU3NDY5Nyw2LjIwNDk4MSwwLjM4MTYyOF0sWzEuMTQ5NTk0LDYuMTczNjA4LDEuNjYwNzYzXSxbLTMuNTAxOTYzLDUuODk1OTg5LDMuNDU2NTc2XSxbMS4wNzExMjIsNS40MjQxOTgsMi41ODg3MTddLFstMC43NzQ2OTMsOC40NzMzMzUsLTAuMjc2OTU3XSxbMy44NDk5NTksNC4xNTU0MiwwLjM5Njc0Ml0sWy0wLjgwMTcxNSw0Ljk3MzE0OSwtMS4wNjg1ODJdLFstMi45Mjc2NzYsMC42MjUxMTIsMi4zMjYzOTNdLFsyLjY2OTY4Miw0LjA0NTU0MiwyLjk3MTE4NF0sWy00LjM5MTMyNCw0Ljc0MDg2LDAuMzQzNDYzXSxbMS41MjAxMjksNi4yNzAwMzEsMC43NzU0NzFdLFsxLjgzNzU4Niw2LjA4NDczMSwwLjEwOTE4OF0sWzEuMjcxNDc1LDUuOTc1MDI0LDIuMDMyMzU1XSxbLTMuNDg3OTY4LDQuNTEzMjQ5LDIuNjA1ODcxXSxbLTEuMzIyMzQsMS41MTcyNjQsLTAuNjkxODc5XSxbLTEuMDgwMzAxLDEuNjQ4MjI2LC0wLjgwNTUyNl0sWy0zLjM2NTcwMyw2LjkxMDE2NiwtMC40NTQ5MDJdLFsxLjM2MDM0LDAuNDMyMjM4LDMuMDc1MDA0XSxbLTMuMzA1MDEzLDUuNzc0Njg1LDMuMzkxNDJdLFszLjg4NDMyLDAuNjU0MTQxLDAuMTI1NzRdLFszLjU3MjU0LDAuMzc3OTM0LDAuMzAyNTAxXSxbNC4xOTYxMzYsMC44MDc5OTksMC4yMTIyMjldLFszLjkzMjk5NywwLjU0MzEyMywwLjM4MDU3OV0sWzQuMDIzNzA0LDMuMjg2MTI1LDAuNTM3NTk3XSxbMS44NjQ0NTUsNC45MTY1NDQsMi42OTE2NzddLFstNC43NzU0MjcsNi40OTk0OTgsMS40NDAxNTNdLFstMy40NjQ5MjgsMy42ODIzNCwyLjc2NjM1Nl0sWzMuNjQ4OTcyLDEuNzUxMjYyLDIuMTU3NDg1XSxbMS4xNzkxMTEsMy4yMzg4NDYsMy43NzQ3OTZdLFstMC4xNzExNjQsMC4yOTkxMjYsLTAuNTkyNjY5XSxbLTQuNTAyOTEyLDMuMzE2NjU2LDAuODc1MTg4XSxbLTAuOTQ4NDU0LDkuMjE0MDI1LC0wLjY3OTUwOF0sWzEuMjM3NjY1LDYuMjg4NTkzLDEuMDQ2XSxbMS41MjM0MjMsNi4yNjg5NjMsMS4xMzk1NDRdLFsxLjQzNjUxOSw2LjE0MDYwOCwxLjczOTMxNl0sWzMuNzIzNjA3LDEuNTA0MzU1LDIuMTM2NzYyXSxbMi4wMDk0OTUsNC4wNDU1MTQsMy4yMjA1M10sWy0xLjkyMTk0NCw3LjI0OTkwNSwwLjIxMzk3M10sWzEuMjU0MDY4LDEuMjA1NTE4LDMuNDc0NzA5XSxbLTAuMzE3MDg3LDUuOTk2MjY5LDAuNTI1ODcyXSxbLTIuOTk2OTE0LDMuOTM0NjA3LDIuOTAwMTc4XSxbLTMuMzE2ODczLDQuMDI4MTU0LDIuNzg1Njk2XSxbLTMuNDAwMjY3LDQuMjgwMTU3LDIuNjg5MjY4XSxbLTMuMTM0ODQyLDQuNTY0ODc1LDIuNjk3MTkyXSxbMS40ODA1NjMsNC42OTI1NjcsMi44MzQwNjhdLFswLjg3MzY4MiwxLjMxNTQ1MiwzLjU0MTU4NV0sWzEuNTk5MzU1LDAuOTE2MjIsMy4yNDY3NjldLFstMy4yOTIxMDIsNy4xMjU5MTQsMi43Njg1MTVdLFszLjc0Mjk2LDQuNTExMjk5LDAuNjE2NTM5XSxbNC42OTg5MzUsMS41NTMzNiwwLjI2OTIxXSxbLTMuMjc0Mzg3LDMuMjk5NDIxLDIuODIzOTQ2XSxbLTIuODg4MDksMy40MTA2OTksMi45NTUyNDhdLFsxLjE3MTQwNywxLjc2OTA1LDMuNjg4NDcyXSxbMS40MzAyNzYsMy45MjQ4MywzLjQ3MzY2Nl0sWzMuOTE2OTQxLDIuNTUzMzA4LDAuMDE4OTQxXSxbMC43MDE2MzIsMi40NDIzNzIsMy43Nzg2MzldLFsxLjU2MjY1NywyLjMwMjc3OCwzLjY2MDk1N10sWzQuNDc2NjIyLDEuMTUyNDA3LDAuMTgyMTMxXSxbLTAuNjExMzYsNS43NjEzNjcsMS41OTg4MzhdLFstMy4xMDIxNTQsMy42OTE2ODcsMi45MDM3MzhdLFsxLjgxNjAxMiw1LjU0NjE2NywyLjM4MDMwOF0sWzMuODUzOTI4LDQuMjUwNjYsMC43NTAwMTddLFsxLjIzNDY4MSwzLjU4MTY2NSwzLjY3MzcyM10sWzEuODYyMjcxLDEuMzYxODYzLDMuMzU1MjA5XSxbMS4zNDY4NDQsNC4xNDY5OTUsMy4zMjc4NzddLFsxLjcwNjcyLDQuMDgwMDQzLDMuMjc0MzA3XSxbMC44OTcyNDIsMS45MDg5ODMsMy42OTY5XSxbLTAuNTg3MDIyLDkuMTkxMTMyLC0wLjU2NTMwMV0sWy0wLjIxNzQyNiw1LjY3NDYwNiwyLjAxOTk2OF0sWzAuMjc4OTI1LDYuMTIwNzc3LDAuNDg1NDAzXSxbMS40NjMzMjgsMy41Nzg3NDIsLTIuMDAxNDY0XSxbLTMuMDcyOTg1LDQuMjY0NTgxLDIuNzg5NTAyXSxbMy42MjM1Myw0LjY3Mzg0MywwLjM4MzQ1Ml0sWy0zLjA1MzQ5MSw4Ljc1MjM3NywtMi45MDg0MzRdLFstMi42Mjg2ODcsNC41MDUwNzIsMi43NTU2MDFdLFswLjg5MTA0Nyw1LjExMzc4MSwyLjc0ODI3Ml0sWy0yLjkyMzczMiwzLjA2NTE1LDIuODY2MzY4XSxbMC44NDgwMDgsNC43NTQyNTIsMi44OTY5NzJdLFstMy4zMTkxODQsOC44MTE2NDEsLTIuMzI3NDEyXSxbMC4xMjg2NCw4LjgxNDc4MSwtMS4zMzQ0NTZdLFsxLjU0OTUwMSw0LjU0OTMzMSwtMS4yODI0M10sWzEuNjQ3MTYxLDMuNzM4OTczLDMuNTA3NzE5XSxbMS4yNTA4ODgsMC45NDU1OTksMy4zNDg3MzldLFszLjgwOTY2Miw0LjAzODgyMiwwLjA1MzE0Ml0sWzEuNDgzMTY2LDAuNjczMzI3LDMuMDkxNTZdLFswLjgyOTcyNiwzLjYzNTkyMSwzLjcxMzEwM10sWzEuMzUyOTE0LDUuMjI2NjUxLDIuNjY4MTEzXSxbMi4yMzczNTIsNC4zNzQxNCwzLjAxNjM4Nl0sWzQuNTA3OTI5LDAuODg5NDQ3LDAuNzQ0MjQ5XSxbNC41NzMwNCwxLjAxMDk4MSwwLjQ5NjU4OF0sWzMuOTMxNDIyLDEuNzIwOTg5LDIuMDg4MTc1XSxbLTAuNDYzMTc3LDUuOTg5ODM1LDAuODM0MzQ2XSxbLTIuODExMjM2LDMuNzQ1MDIzLDIuOTY5NTg3XSxbLTIuODA1MTM1LDQuMjE5NzIxLDIuODQxMTA4XSxbLTIuODM2ODQyLDQuODAyNTQzLDIuNjA4MjZdLFsxLjc3NjcxNiwyLjA4NDYxMSwzLjU2ODYzOF0sWzQuMDQ2ODgxLDEuNDYzNDc4LDIuMTA2MjczXSxbMC4zMTYyNjUsNS45NDQzMTMsMS44OTI3ODVdLFstMi44NjM0NywyLjc3NjA0OSwyLjc3MjQyXSxbLTIuNjczNjQ0LDMuMTE2NTA4LDIuOTA3MTA0XSxbLTIuNjIxMTQ5LDQuMDE4NTAyLDIuOTAzNDA5XSxbLTIuNTczNDQ3LDUuMTk4MDEzLDIuNDc3NDgxXSxbMS4xMDQwMzksMi4yNzg5ODUsMy43MjI0NjldLFstNC42MDI3NDMsNC4zMDY0MTMsMC45MDIyOTZdLFstMi42ODQ4NzgsMS41MTA3MzEsMC41MzUwMzldLFswLjA5MjAzNiw4LjQ3MzI2OSwtMC45OTQxM10sWy0xLjI4MDQ3Miw1LjYwMjM5MywxLjkyODEwNV0sWy0xLjAyNzksNC4xMjE1ODIsLTEuNDAzMTAzXSxbLTIuNDYxMDgxLDMuMzA0NDc3LDIuOTU3MzE3XSxbLTIuMzc1OTI5LDMuNjU5MzgzLDIuOTUzMjMzXSxbMS40MTc1NzksMi43MTUzODksMy43MTg3NjddLFswLjgxOTcyNywyLjk0ODgyMywzLjgxMDYzOV0sWzEuMzI5OTYyLDAuNzYxNzc5LDMuMjAzNzI0XSxbMS43Mzk1Miw1LjI5NTIyOSwyLjUzNzcyNV0sWzAuOTUyNTIzLDMuOTQ1MDE2LDMuNTQ4MjI5XSxbLTIuNTY5NDk4LDAuNjMzNjY5LDIuODQ4MThdLFstMi4yNzY2NzYsMC43NTcwMTMsMi43ODA3MTddLFstMi4wMTMxNDcsNy4zNTQ0MjksLTAuMDAzMjAyXSxbMC45MzE0MywxLjU2NTkxMywzLjYwMDMyNV0sWzEuMjQ5MDE0LDEuNTUwNTU2LDMuNTg1ODQyXSxbMi4yODcyNTIsNC4wNzIzNTMsMy4xMjQ1NDRdLFstNC43MzQ5LDcuMDA2MjQ0LDEuNjkwNjUzXSxbLTMuNTAwNjAyLDguODAzODYsLTIuMDA5MTk2XSxbLTAuNTgyNjI5LDUuNTQ5MTM4LDIuMDAwOTIzXSxbLTEuODY1Mjk3LDYuMzU2MDY2LDEuMzEzNTkzXSxbLTMuMjEyMTU0LDIuMzc2MTQzLC0wLjU2NTU5M10sWzIuMDkyODg5LDMuNDkzNTM2LC0xLjcyNzkzMV0sWy0yLjUyODUwMSwyLjc4NDUzMSwyLjgzMzc1OF0sWy0yLjU2NTY5Nyw0Ljg5MzE1NCwyLjU1OTYwNV0sWy0yLjE1MzM2Niw1LjA0NTg0LDIuNDY1MjE1XSxbMS42MzEzMTEsMi41NjgyNDEsMy42ODE0NDVdLFsyLjE1MDE5Myw0LjY5OTIyNywyLjgwNzUwNV0sWzAuNTA3NTk5LDUuMDE4MTMsMi43NzU4OTJdLFs0LjEyOTg2MiwxLjg2MzY5OCwyLjAxNTEwMV0sWzMuNTc4Mjc5LDQuNTA3NjYsLTAuMDA5NTk4XSxbMy40OTEwMjMsNC44MDY3NDksMS41NDkyNjVdLFswLjYxOTQ4NSwxLjYyNTMzNiwzLjYwNTEyNV0sWzEuMTA3NDk5LDIuOTMyNTU3LDMuNzkwMDYxXSxbLTIuMDgyMjkyLDYuOTkzMjEsMC43NDI2MDFdLFs0LjgzOTkwOSwxLjM3OTI3OSwwLjk0NTI3NF0sWzMuNTkxMzI4LDQuMzIyNjQ1LC0wLjI1OTQ5N10sWzEuMDU1MjQ1LDAuNzEwNjg2LDMuMTY1NTNdLFstMy4wMjY0OTQsNy44NDIyMjcsMS42MjQ1NTNdLFswLjE0NjU2OSw2LjExOTIxNCwwLjk4MTY3M10sWy0yLjA0MzY4NywyLjYxNDUwOSwyLjc4NTUyNl0sWy0yLjMwMjI0MiwzLjA0Nzc3NSwyLjkzNjM1NV0sWy0yLjI0NTY4Niw0LjEwMDQyNCwyLjg3Nzk0XSxbMi4xMTYxNDgsNS4wNjM1MDcsMi41NzIyMDRdLFstMS40NDg0MDYsNy42NDU1OSwwLjI1MTY5Ml0sWzIuNTUwNzE3LDQuOTI2OCwyLjUxNzUyNl0sWy0yLjk1NTQ1Niw3LjgwMjkzLC0xLjc4MjQwN10sWzEuODgyOTk1LDQuNjM3MTY3LDIuODk1NDM2XSxbLTIuMDE0OTI0LDMuMzk4MjYyLDIuOTU0ODk2XSxbLTIuMjczNjU0LDQuNzcxMjI3LDIuNjExNDE4XSxbLTIuMTYyNzIzLDcuODc2NzYxLDAuNzAyNDczXSxbLTAuMTk4NjU5LDUuODIzMDYyLDEuNzM5MjcyXSxbLTEuMjgwOTA4LDIuMTMzMTg5LC0wLjkyMTI0MV0sWzIuMDM5OTMyLDQuMjUxNTY4LDMuMTM2NTc5XSxbMS40Nzc4MTUsNC4zNTQzMzMsMy4xMDgzMjVdLFswLjU2MDUwNCwzLjc0NDEyOCwzLjY5MTNdLFstMi4yMzQwMTgsMS4wNTQzNzMsMi4zNTI3ODJdLFstMy4xODkxNTYsNy42ODY2NjEsLTIuNTE0OTU1XSxbLTMuNzQ0NzM2LDcuNjk5NjMsMi4xMTY5NzNdLFstMi4yODMzNjYsMi44NzgzNjUsMi44Nzg4Ml0sWy0yLjE1Mzc4Niw0LjQ1NzQ4MSwyLjc0MzUyOV0sWzQuOTMzOTc4LDEuNjc3Mjg3LDAuNzEzNzczXSxbMy41MDIxNDYsMC41MzUzMzYsMS43NTI1MTFdLFsxLjgyNTE2OSw0LjQxOTI1MywzLjA4MTE5OF0sWzMuMDcyMzMxLDAuMjgwOTc5LDAuMTA2NTM0XSxbLTAuNTA4MzgxLDEuMjIwMzkyLDIuODc4MDQ5XSxbLTMuMTM4ODI0LDguNDQ1Mzk0LC0xLjY1OTcxMV0sWy0yLjA1NjQyNSwyLjk1NDgxNSwyLjg5NzI0MV0sWy0yLjAzNTM0Myw1LjM5ODQ3NywyLjIxNTg0Ml0sWy0zLjIzOTkxNSw3LjEyNjc5OCwtMC43MTI1NDddLFstMS44Njc5MjMsNy45ODk4MDUsMC41MjY1MThdLFsxLjIzNDA1LDYuMjQ4OTczLDEuMzg3MTg5XSxbLTAuMjE2NDkyLDguMzIwOTMzLC0wLjg2MjQ5NV0sWy0yLjA3OTY1OSwzLjc1NTcwOSwyLjkyODU2M10sWy0xLjc4NTk1LDQuMzAwMzc0LDIuODA1Mjk1XSxbLTEuODU2NTg5LDUuMTA2NzgsMi4zODY1NzJdLFstMS43MTQzNjIsNS41NDQ3NzgsMi4wMDQ2MjNdLFsxLjcyMjQwMyw0LjIwMDI5MSwtMS40MDgxNjFdLFswLjE5NTM4NiwwLjA4NjkyOCwtMS4zMTgwMDZdLFsxLjM5MzY5MywzLjAxMzQwNCwzLjcxMDY4Nl0sWy0wLjQxNTMwNyw4LjUwODQ3MSwtMC45OTY4ODNdLFstMS44NTM3NzcsMC43NTU2MzUsMi43NTcyNzVdLFstMS43MjQwNTcsMy42NDUzMywyLjg4NDI1MV0sWy0xLjg4NDUxMSw0LjkyNzgwMiwyLjUzMDg4NV0sWy0xLjAxNzE3NCw3Ljc4MzkwOCwtMC4yMjcwNzhdLFstMS43Nzk4LDIuMzQyNTEzLDIuNzQxNzQ5XSxbLTEuODQxMzI5LDMuOTQzOTk2LDIuODg0MzZdLFsxLjQzMDM4OCw1LjQ2ODA2NywyLjUwMzQ2N10sWy0yLjAzMDI5NiwwLjk0MDAyOCwyLjYxMTA4OF0sWy0xLjY3NzAyOCwxLjIxNTY2NiwyLjYwNzc3MV0sWy0xLjc0MDkyLDIuODMyNTY0LDIuODI3Mjk1XSxbNC4xNDQ2NzMsMC42MzEzNzQsMC41MDMzNThdLFs0LjIzODgxMSwwLjY1Mzk5MiwwLjc2MjQzNl0sWy0xLjg0NzAxNiwyLjA4MjgxNSwyLjY0MjY3NF0sWzQuMDQ1NzY0LDMuMTk0MDczLDAuODUyMTE3XSxbLTEuNTYzOTg5LDguMTEyNzM5LDAuMzAzMTAyXSxbLTEuNzgxNjI3LDEuNzk0ODM2LDIuNjAyMzM4XSxbLTEuNDkzNzQ5LDIuNTMzNzk5LDIuNzk3MjUxXSxbLTEuOTM0NDk2LDQuNjkwNjg5LDIuNjU4OTk5XSxbLTEuNDk5MTc0LDUuNzc3OTQ2LDEuNzQ3NDk4XSxbLTIuMzg3NDA5LDAuODUxMjkxLDEuNTAwNTI0XSxbLTEuODcyMjExLDguMjY5OTg3LDAuMzkyNTMzXSxbLTQuNjQ3NzI2LDYuNzY1NzcxLDAuODMzNjUzXSxbLTMuMTU3NDgyLDAuMzQxOTU4LC0wLjIwNjcxXSxbLTEuNzI1NzY2LDMuMjQ3MDMsMi44ODM1NzldLFstMS40NTgxOTksNC4wNzkwMzEsMi44MzYzMjVdLFstMS42MjE1NDgsNC41MTU4NjksMi43MTkyNjZdLFstMS42MDcyOTIsNC45MTg5MTQsMi41MDU4ODFdLFstMS40OTQ2NjEsNS41NTYyMzksMS45OTE1OTldLFstMS43MjcyNjksNy40MjM3NjksMC4wMTIzMzddLFstMS4zODI0OTcsMS4xNjEzMjIsMi42NDAyMjJdLFstMS41MjEyOSw0LjY4MTcxNCwyLjYxNTQ2N10sWy00LjI0NzEyNywyLjc5MjgxMiwxLjI1MDg0M10sWy0xLjU3NjMzOCwwLjc0Mjk0NywyLjc2OTc5OV0sWy0xLjQ5OTI1NywyLjE3Mjc2MywyLjc0MzE0Ml0sWy0xLjQ4MDM5MiwzLjEwMzI2MSwyLjg2MjI2Ml0sWzEuMDQ5MTM3LDIuNjI1ODM2LDMuNzc1Mzg0XSxbLTEuMzY4MDYzLDEuNzkxNTg3LDIuNjk1NTE2XSxbLTEuMzA3ODM5LDIuMzQ0NTM0LDIuNzY3NTc1XSxbLTEuMzM2NzU4LDUuMDkyMjIxLDIuMzU1MjI1XSxbLTEuNTYxNyw1LjMwMTc0OSwyLjIxNjI1XSxbLTEuNDgzMzYyLDguNTM3NzA0LDAuMTk2NzUyXSxbLTEuNTE3MzQ4LDguNzczNjE0LDAuMDc0MDUzXSxbLTEuNDc0MzAyLDEuNDkyNzMxLDIuNjQxNDMzXSxbMi40ODcxOCwwLjY0NDI0NywtMC45MjAyMjZdLFswLjgxODA5MSwwLjQyMjY4MiwzLjE3MTIxOF0sWy0zLjYyMzM5OCw2LjkzMDA5NCwzLjAzMzA0NV0sWzEuNjc2MzMzLDMuNTMxMDM5LDMuNTkxNTkxXSxbMS4xOTk5MzksNS42ODM4NzMsMi4zNjU2MjNdLFstMS4yMjM4NTEsOC44NDEyMDEsMC4wMjU0MTRdLFstMS4yODYzMDcsMy44NDc2NDMsMi45MTgwNDRdLFstMS4yNTg1Nyw0LjgxMDgzMSwyLjU0MzYwNV0sWzIuNjAzNjYyLDUuNTcyMTQ2LDEuOTkxODU0XSxbMC4xMzg5ODQsNS43Nzk3MjQsMi4wNzc4MzRdLFstMS4yNjcwMzksMy4xNzUxNjksMi44OTA4ODldLFstMS4yOTM2MTYsMy40NTQ2MTIsMi45MTE3NzRdLFstMi42MDExMiwxLjI3NzE4NCwwLjA3NzI0XSxbMi41NTI3NzksMy42NDk4NzcsMy4xNjM2NDNdLFstMS4wMzg5ODMsMS4yNDgwMTEsMi42MDU5MzNdLFstMS4yODg3MDksNC4zOTA5NjcsMi43NjEyMTRdLFstMS4wMzQyMTgsNS40ODU5NjMsMi4wMTE0NjddLFstMS4xODU1NzYsMS40NjQ4NDIsMi42MjQzMzVdLFstMS4wNDU2ODIsMi41NDg5NiwyLjc2MTEwMl0sWzQuMjU5MTc2LDEuNjYwNjI3LDIuMDE4MDk2XSxbLTAuOTYxNzA3LDEuNzE3MTgzLDIuNTk4MzQyXSxbLTEuMDQ0NjAzLDMuMTQ3NDY0LDIuODU1MzM1XSxbLTAuODkxOTk4LDQuNjg1NDI5LDIuNjY5Njk2XSxbLTEuMDI3NTYxLDUuMDgxNjcyLDIuMzc3OTM5XSxbNC4zODY1MDYsMC44MzI0MzQsMC41MTAwNzRdLFstMS4wMTQyMjUsOS4wNjQ5OTEsLTAuMTc1MzUyXSxbLTEuMjE4NzUyLDIuODk1NDQzLDIuODIzNzg1XSxbLTAuOTcyMDc1LDQuNDMyNjY5LDIuNzg4MDA1XSxbLTIuNzE0OTg2LDAuNTI0MjUsMS41MDk3OThdLFstMC42OTkyNDgsMS41MTcyMTksMi42NDU3MzhdLFstMS4xNjE1ODEsMi4wNzg4NTIsMi43MjI3OTVdLFstMC44NDUyNDksMy4yODYyNDcsMi45OTY0NzFdLFsxLjA2ODMyOSw0LjQ0MzQ0NCwyLjk5Mzg2M10sWzMuOTgxMzIsMy43MTU1NTcsMS4wMjc3NzVdLFsxLjY1ODA5NywzLjk4MjQyOCwtMS42NTE2ODhdLFstNC4wNTM3MDEsMi40NDk4ODgsMC43MzQ3NDZdLFstMC45MTA5MzUsMi4yMTQxNDksMi43MDIzOTNdLFswLjA4NzgyNCwzLjk2MTY1LDMuNDM5MzQ0XSxbLTAuNzc5NzE0LDMuNzI0MTM0LDIuOTkzNDI5XSxbLTEuMDUxMDkzLDMuODEwNzk3LDIuOTQxOTU3XSxbLTAuNjQ0OTQxLDQuMzg1OSwyLjg3MDg2M10sWy0yLjk4NDAzLDguNjY2ODk1LC0zLjY5MTg4OF0sWy0wLjc1NDMwNCwyLjUwODMyNSwyLjgxMjk5OV0sWy00LjYzNTUyNCwzLjY2Mjg5MSwwLjkxMzAwNV0sWy0wLjk4MzI5OSw0LjEyNTk3OCwyLjkxNTM3OF0sWzQuOTE2NDk3LDEuOTA1MjA5LDAuNjIxMzE1XSxbNC44NzQ5ODMsMS43Mjg0MjksMC40Njg1MjFdLFsyLjMzMTI3LDUuMTgxOTU3LDIuNDQxNjk3XSxbLTAuNjUzNzExLDIuMjUzMzg3LDIuNzk0OV0sWy0zLjYyMzc0NCw4Ljk3ODc5NSwtMi40NjE5Ml0sWy00LjU1NTkyNyw2LjE2MDI3OSwwLjIxNTc1NV0sWy00Ljk0MDYyOCw1LjgwNjcxMiwxLjE4MzgzXSxbMy4zMDg1MDYsMi40MDMyNiwtMC45MTA3NzZdLFswLjU4ODM1LDUuMjUxOTI4LC0wLjk5Mjg4Nl0sWzIuMTUyMjE1LDUuNDQ5NzMzLDIuMzMxNjc5XSxbLTAuNzEyNzU1LDAuNzY2NzY1LDMuMjgwMzc1XSxbLTAuNzQxNzcxLDEuOTcxNiwyLjY1NzIzNV0sWy00LjgyODk1Nyw1LjU2Njk0NiwyLjYzNTYyM10sWy0zLjQ3NDc4OCw4LjY5Njc3MSwtMS43NzYxMjFdLFsxLjc3MDQxNyw2LjIwNTU2MSwxLjMzMTYyN10sWy0wLjYyMDYyNiw0LjA2NDcyMSwyLjk2ODk3Ml0sWy0xLjQ5OTE4NywyLjMwNzczNSwtMC45Nzg5MDFdLFs0LjA5ODc5MywyLjMzMDI0NSwxLjY2Nzk1MV0sWzEuOTQwNDQ0LDYuMTY3MDU3LDAuOTM1OTA0XSxbLTIuMzE0NDM2LDEuMTA0OTk1LDEuNjgxMjc3XSxbLTIuNzMzNjI5LDcuNzQyNzkzLDEuNzcwNV0sWy0wLjQ1MjI0OCw0LjcxOTg2OCwyLjc0MDgzNF0sWy0wLjY0OTE0Myw0Ljk1MTcxMywyLjU0MTI5Nl0sWy0wLjQ3OTQxNyw5LjQzOTU5LC0wLjY3NjMyNF0sWy0yLjI1MTg1Myw2LjU1OTI3NSwwLjA0NjgxOV0sWzAuMDMzNTMxLDguMzE2OTA3LC0wLjc4OTkzOV0sWy0wLjUxMzEyNSwwLjk5NTY3MywzLjEyNTQ2Ml0sWy0yLjYzNzYwMiwxLjAzOTc0NywwLjYwMjQzNF0sWzEuNTI3NTEzLDYuMjMwMDg5LDEuNDMwOTAzXSxbNC4wMzYxMjQsMi42MDk4NDYsMS41MDY0OThdLFstMy41NTk4MjgsNy44Nzc4OTIsMS4yMjgwNzZdLFstNC41NzA3MzYsNC45NjAxOTMsMC44MzgyMDFdLFstMC40MzIxMjEsNS4xNTc3MzEsMi40Njc1MThdLFstMS4yMDY3MzUsNC41NjI1MTEsLTEuMjM3MDU0XSxbLTAuODIzNzY4LDMuNzg4NzQ2LC0xLjU2NzQ4MV0sWy0zLjA5NTU0NCw3LjM1MzYxMywtMS4wMjQ1NzddLFstNC4wNTYwODgsNy42MzExMTksMi4wNjIwMDFdLFstMC4yODkzODUsNS4zODIyNjEsMi4zMjk0MjFdLFsxLjY5NzUyLDYuMTM2NDgzLDEuNjY3MDM3XSxbLTAuMTY4NzU4LDUuMDYxMTM4LDIuNjE3NDUzXSxbMi44NTM1NzYsMS42MDU1MjgsLTEuMjI5OTU4XSxbLTQuNTE0MzE5LDYuNTg2Njc1LDAuMzUyNzU2XSxbLTIuNTU4MDgxLDcuNzQxMTUxLDEuMjkyOTVdLFsxLjYxMTE2LDUuOTIzNTgsMi4wNzE1MzRdLFszLjkzNjkyMSwzLjM1NDg1NywwLjA5MTc1NV0sWy0wLjE2MzMsMS4xMTkyNzIsMy4xNDc5NzVdLFswLjA2NzU1MSwxLjU5MzQ3NSwzLjM4MjEyXSxbLTEuMzAzMjM5LDIuMzI4MTg0LC0xLjAxMTY3Ml0sWy0wLjQzODA5MywwLjczNDIzLDMuMzk4Mzg0XSxbLTQuNjI3NjcsMy44OTgxODcsMC44NDk1NzNdLFswLjI4Njg1Myw0LjE2NTI4MSwzLjI4NDgzNF0sWy0yLjk2ODA1Miw4LjQ5MjgxMiwtMy40OTM2OTNdLFstMC4xMTE4OTYsMy42OTYxMTEsMy41Mzc5MV0sWy0zLjgwODI0NSw4LjQ1MTczMSwtMS41NzQ3NDJdLFswLjA1MzQxNiw1LjU1ODc2NCwyLjMxMTA3XSxbMy45NTYyNjksMy4wMTIwNzEsMC4xMTEyMV0sWy0wLjcxMDk1Niw4LjEwNjU2MSwtMC42NjUxNTRdLFswLjIzNDcyNSwyLjcxNzMyNiwzLjcyMjM3OV0sWy0wLjAzMTU5NCwyLjc2NDExLDMuNjU3MzQ3XSxbLTAuMDE3MzcxLDQuNzAwNjMzLDIuODE5MTFdLFswLjIxNTA2NCw1LjAzNDg1OSwyLjcyMTQyNl0sWy0wLjExMTE1MSw4LjQ4MDMzMywtMC42NDkzOTldLFszLjk3OTQyLDMuNTc1NDc4LDAuMzYyMjE5XSxbMC4zOTI5NjIsNC43MzUzOTIsMi44NzQzMjFdLFs0LjE3MDE1LDIuMDg1MDg3LDEuODY1OTk5XSxbMC4xNjkwNTQsMS4yNDQ3ODYsMy4zMzc3MDldLFswLjAyMDA0OSwzLjE2NTgxOCwzLjcyMTczNl0sWzAuMjQ4MjEyLDMuNTk1NTE4LDMuNjk4Mzc2XSxbMC4xMzA3MDYsNS4yOTU1NDEsMi41NDAwMzRdLFstNC41NDEzNTcsNC43OTgzMzIsMS4wMjY4NjZdLFstMS4yNzc0ODUsMS4yODk1MTgsLTAuNjY3MjcyXSxbMy44OTIxMzMsMy41NDI2MywtMC4wNzgwNTZdLFs0LjA1NzM3OSwzLjAzNjY5LDAuOTk3OTEzXSxbMC4yODc3MTksMC44ODQ3NTgsMy4yNTE3ODddLFswLjUzNTc3MSwxLjE0NDcwMSwzLjQwMDA5Nl0sWzAuNTg1MzAzLDEuMzk5MzYyLDMuNTA1MzUzXSxbMC4xOTE1NTEsMi4wNzYyNDYsMy41NDkzNTVdLFswLjMyODY1NiwyLjM5NDU3NiwzLjY0OTYyM10sWzAuNDEzMTI0LDMuMjQwNzI4LDMuNzcxNTE1XSxbMC42MzAzNjEsNC41MDE1NDksMi45NjM2MjNdLFswLjUyOTQ0MSw1Ljg1NDM5MiwyLjEyMDIyNV0sWzMuODA1Nzk2LDMuNzY5OTU4LC0wLjE2MjA3OV0sWzMuNDQ3Mjc5LDQuMzQ0ODQ2LC0wLjQ2NzI3Nl0sWzAuMzc3NjE4LDUuNTUxMTE2LDIuNDI2MDE3XSxbMC40MDkzNTUsMS44MjEyNjksMy42MDYzMzNdLFswLjcxOTk1OSwyLjE5NDcyNiwzLjcwMzg1MV0sWzAuNDk1OTIyLDMuNTAxNTE5LDMuNzU1NjYxXSxbMC42MDM0MDgsNS4zNTQwOTcsMi42MDMwODhdLFstNC42MDUwNTYsNy41MzE5NzgsMS4xOTU3OV0sWzAuOTA3OTcyLDAuOTczMTI4LDMuMzU2NTEzXSxbMC43NTAxMzQsMy4zNTYxMzcsMy43NjU4NDddLFswLjQ0OTYsMy45OTMyNDQsMy41MDQ1NDRdLFstMy4wMzA3MzgsNy40ODk0NywtMS4yNTkxNjldLFswLjcwNzUwNSw1LjYwMjAwNSwyLjQzNDc2XSxbMC42Njg5NDQsMC42NTQ4OTEsMy4yMTM3OTddLFswLjU5MzI0NCwyLjcwMDk3OCwzLjc5MTQyN10sWzEuNDY3NzU5LDMuMzAzMjcsMy43MTAzNV0sWzMuMzE2MjQ5LDIuNDM2Mzg4LDIuNTgxMTc1XSxbMy4yNjEzOCwxLjcyNDQyNSwyLjUzOTAyOF0sWy0xLjIzMTI5Miw3Ljk2ODI2MywwLjI4MTQxNF0sWy0wLjEwODc3Myw4LjcxMjMwNywtMC43OTA2MDddLFs0LjQ0NTY4NCwxLjgxOTQ0MiwxLjg5Njk4OF0sWzEuOTk4OTU5LDIuMjgxNDk5LDMuNDk0NDddLFsyLjE2MjI2OSwyLjExMzgxNywzLjM2NTQ0OV0sWzQuMzYzMzk3LDEuNDA2NzMxLDEuOTIyNzE0XSxbNC44MDgsMi4yMjU4NDIsMC42MTExMjddLFsyLjczNTkxOSwwLjc3MTgxMiwtMC43MDExNDJdLFsxLjg5NzczNSwyLjg3ODQyOCwzLjU4MzQ4Ml0sWy0zLjMxNjE2LDUuMzMxOTg1LDMuMjEyMzk0XSxbLTMuMzMxNCw2LjAxODEzNywzLjMxMzAxOF0sWy0zLjUwMzE4Myw2LjQ4MDEwMywzLjIyMjIxNl0sWy0xLjkwNDQ1Myw1Ljc1MDM5MiwxLjkxMzMyNF0sWy0xLjMzOTczNSwzLjU1OTU5MiwtMS40MjE4MTddLFstMS4wNDQyNDIsOC4yMjUzOSwwLjAzNzQxNF0sWzEuNjQzNDkyLDMuMTEwNjc2LDMuNjQ3NDI0XSxbMy45OTI4MzIsMy42ODYyNDQsMC43MTA5NDZdLFsxLjc3NDIwNywxLjcxODQyLDMuNDc1NzY4XSxbLTMuNDM4ODQyLDUuNTcxMywzLjQyNzgxOF0sWzQuNjAyNDQ3LDEuMjU4MywxLjYxOTUyOF0sWy0wLjkyNTUxNiw3LjkzMDA0MiwwLjA3MjMzNl0sWy0xLjI1MjA5MywzLjg0NjU2NSwtMS40MjA3NjFdLFstMy40MjY4NTcsNS4wNzI0MTksMi45NzgwNl0sWy0zLjE2MDQwOCw2LjE1MjYyOSwzLjA2MTg2OV0sWzMuNzM5OTMxLDMuMzY3MDgyLDIuMDQxMjczXSxbMS4wMjc0MTksNC4yMzU4OTEsMy4yNTEyNTNdLFs0Ljc3NzcwMywxLjg4NzQ1MiwxLjU2MDQwOV0sWy0zLjMxODUyOCw2LjczMzc5NiwyLjk4Mjk2OF0sWzIuOTI5MjY1LDQuOTYyNTc5LDIuMjcxMDc5XSxbMy40NDk3NjEsMi44Mzg2MjksMi40NzQ1NzZdLFstMy4yODAxNTksNS4wMjk4NzUsMi43ODc1MTRdLFs0LjA2ODkzOSwyLjk5MzYyOSwwLjc0MTU2N10sWzAuMzAzMzEyLDguNzA5MjcsLTEuMTIxOTcyXSxbMC4yMjk4NTIsOC45ODEzMjIsLTEuMTg2MDc1XSxbLTAuMDExMDQ1LDkuMTQ4MTU2LC0xLjA0NzA1N10sWy0yLjk0MjY4Myw1LjU3OTYxMywyLjkyOTI5N10sWy0zLjE0NTQwOSw1LjY5ODcyNywzLjIwNTc3OF0sWy0zLjAxOTA4OSw2LjMwODg3LDIuNzk0MzIzXSxbLTMuMjE3MTM1LDYuNDY4MTkxLDIuOTcwMDMyXSxbLTMuMDQ4Mjk4LDYuOTkzNjQxLDIuNjIzMzc4XSxbLTMuMDc0MjksNi42NjA5ODIsMi43MDI0MzRdLFszLjYxMjAxMSwyLjU1NzQsMi4yNTM0OV0sWzIuNTQ1MTYsNC41NTM5NjcsMi43NTg4NF0sWy0xLjY4Mzc1OSw3LjQwMDc4NywwLjI1MDg2OF0sWy0xLjc1NjA2Niw3LjQ2MzU1NywwLjQ0ODAzMV0sWy0zLjAyMzc2MSw1LjE0OTY5NywyLjY3MzUzOV0sWzMuMTEyMzc2LDIuNjc3MjE4LDIuNzgyMzc4XSxbMi44MzUzMjcsNC41ODExOTYsMi41NjcxNDZdLFstMi45NzM3OTksNy4yMjU0NTgsMi41MDY5ODhdLFstMC41OTE2NDUsOC43NDA2NjIsLTAuNTA1ODQ1XSxbMy43ODI4NjEsMi4wNDMzNywyLjAzMDY2XSxbMy4zMzE2MDQsMy4zNjM0MywyLjYwNTA0N10sWzIuOTY2ODY2LDEuMjA1NDk3LDIuNTM3NDMyXSxbMC4wMDI2NjksOS42NTQ3NDgsLTEuMzU1NTU5XSxbMi42MzI4MDEsMC41ODQ5NywyLjU0MDMxMV0sWy0yLjgxOTM5OCw1LjA4NzM3MiwyLjUyMTA5OF0sWzIuNjE2MTkzLDUuMzMyOTYxLDIuMTk0Mjg4XSxbLTMuMTkzOTczLDQuOTI1NjM0LDIuNjA3OTI0XSxbLTMuMTI2MTgsNS4yNzUyNCwyLjk0NDU0NF0sWy0wLjQyNjAwMyw4LjUxNjM1NCwtMC41MDE1MjhdLFsyLjgwMjcxNywxLjM4NzY0MywyLjc1MTY0OV0sWy0zLjEyMDU5Nyw3Ljg4OTExMSwtMi43NTQzMV0sWzIuNjM2NjQ4LDEuNzE3MDIsMi45OTEzMDJdLFstMi44NTMxNTEsNi43MTE3OTIsMi40MzAyNzZdLFstMi44NDM4MzYsNi45NjI4NjUsMi40MDA4NDJdLFsxLjk2OTYsMy4xOTkwMjMsMy41MDQ1MTRdLFstMi40NjE3NTEsMC4zODYzNTIsMy4wMDg5OTRdLFsxLjY0MTI3LDAuNDk1NzU4LDMuMDI5NThdLFstNC4zMzA0NzIsNS40MDk4MzEsMC4wMjUyODddLFstMi45MTIzODcsNS45ODA0MTYsMi44NDQyNjFdLFstMi40OTAwNjksMC4yMTEwNzgsMi45ODUzOTFdLFszLjU4MTgxNiw0LjgwOTExOCwwLjczMzcyOF0sWzIuNjkzMTk5LDIuNjQ3MjEzLDMuMTI2NzA5XSxbLTAuMTgyOTY0LDguMTg0MTA4LC0wLjYzODQ1OV0sWy0yLjIyNjg1NSwwLjQ0NDcxMSwyLjk0NjU1Ml0sWy0wLjcyMDE3NSw4LjExNTA1NSwwLjAxNzY4OV0sWzIuNjQ1MzAyLDQuMzE2MjEyLDIuODUwMTM5XSxbLTAuMjMyNzY0LDkuMzI5NTAzLC0wLjkxODYzOV0sWzQuODUyMzY1LDEuNDcxOTAxLDAuNjUyNzVdLFsyLjc2MjI5LDIuMDE0OTk0LDIuOTU3NzU1XSxbLTIuODA4Mzc0LDUuMzU0MzAxLDIuNjQ0Njk1XSxbLTIuNzkwOTY3LDYuNDA2OTYzLDIuNTQ3OTg1XSxbLTEuMzQyNjg0LDAuNDE4NDg4LC0xLjY2OTE4M10sWzIuNjkwNjc1LDUuNTkzNTg3LC0wLjA0MTIzNl0sWzQuNjYwMTQ2LDEuNjMxOCwxLjcxMzMxNF0sWzIuNzc1NjY3LDMuMDA3MjI5LDMuMTExMzMyXSxbLTAuMzk2Njk2LDguOTYzNDMyLC0wLjcwNjIwMl0sWzIuNDQ2NzA3LDIuNzQwNjE3LDMuMzIxNDMzXSxbLTQuODAzMjA5LDUuODg0NjM0LDIuNjAzNjcyXSxbLTIuNjUyMDAzLDEuNjU0MSwxLjUwNzhdLFszLjkzMjMyNywzLjk3Mjg3NCwwLjgzMTkyNF0sWzIuMTM1OTA2LDAuOTU1NTg3LDIuOTg2NjA4XSxbMi40ODYxMzEsMi4wNTM4MDIsMy4xMjQxMTVdLFstMC4zODY3MDYsOC4xMTU3NTMsLTAuMzc1NjVdLFstMi43MjA3MjcsNy4zMjUwNDQsMi4yMjQ4NzhdLFstMS4zOTY5NDYsNy42MzgwMTYsLTAuMTY0ODZdLFstMC42MjA4Myw3Ljk4OTc3MSwtMC4xNDQ0MTNdLFstMi42NTMyNzIsNS43Mjk2ODQsMi42Njc2NzldLFszLjAzODE4OCw0LjY1ODM1LDIuMzY0MTQyXSxbMi4zODE3MjEsMC43Mzk0NzIsMi43ODg5OTJdLFstMi4zNDU4MjksNS40NzQ5MjksMi4zODA2MzNdLFstMi41MTg5ODMsNi4wODA1NjIsMi40NzkzODNdLFstMi42MTU3OTMsNi44Mzk2MjIsMi4xODYxMTZdLFstMi4yODY1NjYsMC4xNDM3NTIsMi43NjY4NDhdLFstNC43NzEyMTksNi41MDg3NjYsMS4wNzA3OTddLFszLjcxNzMwOCwyLjkwNTAxOSwyLjA5Nzk5NF0sWzIuNTA1MjEsMy4wMTY3NDMsMy4yOTU4OThdLFsyLjIwODQ0OCwxLjU2MDI5LDMuMjE2ODA2XSxbMy4zNDY3ODMsMS4wMTI1NCwyLjExOTk1MV0sWzIuNjUzNTAzLDMuMjYxMjIsMy4xNzU3MzhdLFstMi4zNTk2MzYsNS44Mjc1MTksMi40MDIyOTddLFstMS45NTI2OTMsMC41NTgxMDIsMi44NTMzMDddLFstMC4zMjE1NjIsOS40MTQ4ODUsLTEuMTg3NTAxXSxbMy4xMzg5MjMsMS40MDUwNzIsMi41MjA3NjVdLFsxLjQ5MzcyOCwxLjc4MDA1MSwzLjYyMTk2OV0sWzMuMDE4MTcsMC45MDcyOTEsMi4zMzY5MDldLFszLjE4MzU0OCwxLjE4NTI5NywyLjM1MjE3NV0sWzEuNjA4NjE5LDUuMDA2NzUzLDIuNjk1MTMxXSxbLTQuNzIzOTE5LDYuODM2MTA3LDEuMDk1Mjg4XSxbLTEuMDE3NTg2LDguODY1NDI5LC0wLjE0OTMyOF0sWzQuNzMwNzYyLDEuMjE0MDE0LDAuNjQwMDhdLFstMi4xMzUxODIsNi42NDc5MDcsMS40OTU0NzFdLFstMi40MjAzODIsNi41NDYxMTQsMi4xMDgyMDldLFstMi40NTgwNTMsNy4xODYzNDYsMS44OTY2MjNdLFszLjQzNzEyNCwwLjI3NTc5OCwxLjEzODIwM10sWzAuMDk1OTI1LDguNzI1ODMyLC0wLjkyNjQ4MV0sWzIuNDE3Mzc2LDIuNDI5ODY5LDMuMjg3NjU5XSxbMi4yNzk5NTEsMS4yMDAzMTcsMy4wNDk5OTRdLFsyLjY3NDc1MywyLjMyNjkyNiwzLjA0NDA1OV0sWy0yLjMyODEyMyw2Ljg0OTE2NCwxLjc1NzUxXSxbLTMuNDE4NjE2LDcuODUzNDA3LDAuMTI2MjQ4XSxbLTMuMTUxNTg3LDcuNzc1NDMsLTAuMTEwODg5XSxbMi4zNDkxNDQsNS42NTMyNDIsMi4wNTg2OV0sWy0yLjI3MzIzNiw2LjA4NTYzMSwyLjI0Mjg4OF0sWy00LjU2MDYwMSw0LjUyNTM0MiwxLjI2MTI0MV0sWzIuODY2MzM0LDMuNzk2MDY3LDIuOTM0NzE3XSxbLTIuMTc0OTMsNi41MDU1MTgsMS43OTEzNjddLFszLjEyMDU5LDMuMjgzMTU3LDIuODE4ODY5XSxbMy4wMzc3MDMsMy41NjIzNTYsMi44NjY2NTNdLFswLjA2NjIzMyw5LjQ4ODQxOCwtMS4yNDgyMzddLFsyLjc0OTk0MSwwLjk3NTAxOCwyLjU3MzM3MV0sWy0yLjE1NTc0OSw1LjgwMTAzMywyLjIwNDAwOV0sWy0yLjE2Mjc3OCw2LjI2MTg4OSwyLjAyODU5Nl0sWzEuOTM2ODc0LDAuNDU5MTQyLDIuOTU2NzE4XSxbMy4xNzYyNDksNC4zMzU1NDEsMi40NDA0NDddLFs0LjM1NjU5OSwxLjAyOTQyMywxLjcwMDU4OV0sWzMuODczNTAyLDMuMDgyNjc4LDEuODA0MzFdLFsyLjg5NTQ4OSw0LjI0MzAzNCwyLjczNTI1OV0sWy0wLjA5NTc3NCw5LjQ2ODE5NSwtMS4wNzQ1MV0sWy0xLjEyNDk4Miw3Ljg4NjgwOCwtMC40ODA4NTFdLFszLjAzMjMwNCwzLjA2NTQ1NCwyLjg5NzkyN10sWzMuNjkyNjg3LDQuNTk2MSwwLjk1Nzg1OF0sWy0zLjAxMzA0NSwzLjgwNzIzNSwtMS4wOTgzODFdLFstMC43OTAwMTIsOC45MjkxMiwtMC4zNjc1NzJdLFsxLjkwNTc5MywwLjczMTc5LDIuOTk2NzI4XSxbMy41MzAzOTYsMy40MjYyMzMsMi4zNTY1ODNdLFsyLjEyMjk5LDAuNjI0OTMzLDIuOTI5MTY3XSxbLTIuMDY5MTk2LDYuMDM5Mjg0LDIuMDEyNTFdLFstMy41NjU2MjMsNy4xODI1MjUsMi44NTAwMzldLFsyLjk1OTI2NCwyLjM3NjMzNywyLjgyOTI0Ml0sWzIuOTQ5MDcxLDEuODIyNDgzLDIuNzkzOTMzXSxbNC4wMzYxNDIsMC43NjM4MDMsMS43MDM3NDRdLFstMS45OTM1MjcsNi4xODAzMTgsMS44MDQ5MzZdLFstMC4wMzA5ODcsMC43NjYzODksMy4zNDQ3NjZdLFstMC41NDk2ODMsOC4yMjUxOTMsLTAuMTg5MzQxXSxbLTAuNzY1NDY5LDguMjcyMjQ2LC0wLjEyNzE3NF0sWy0yLjk0NzA0Nyw3LjU0MTY0OCwtMC40MTQxMTNdLFstMy4wNTAzMjcsOS4xMDExNCwtMy40MzU2MTldLFszLjQ4ODU2NiwyLjIzMTgwNywyLjM5OTgzNl0sWzMuMzUyMjgzLDQuNzI3ODUxLDEuOTQ2NDM4XSxbNC43NDEwMTEsMi4xNjI3NzMsMS40OTk1NzRdLFstMS44MTUwOTMsNi4wNzIwNzksMS41ODA3MjJdLFstMy43MjA5NjksOC4yNjc5MjcsLTAuOTg0NzEzXSxbMS45MzI4MjYsMy43MTQwNTIsMy40Mjc0ODhdLFszLjMyMzYxNyw0LjQzODk2MSwyLjIwNzMyXSxbMC4yNTQxMTEsOS4yNjM2NCwtMS4zNzMyNDRdLFstMS40OTMzODQsNy44Njg1ODUsLTAuNDUwMDUxXSxbLTAuODQxOTAxLDAuNzc2MTM1LC0xLjYxOTQ2N10sWzAuMjQzNTM3LDYuMDI3NjY4LDAuMDkxNjg3XSxbMC4zMDMwNTcsMC4zMTMwMjIsLTAuNTMxMTA1XSxbLTAuNDM1MjczLDAuNDc0MDk4LDMuNDgxNTUyXSxbMi4xMjE1MDcsMi42MjIzODksMy40ODYyOTNdLFsxLjk2MTk0LDEuMTAxNzUzLDMuMTU5NTg0XSxbMy45Mzc5OTEsMy40MDc1NTEsMS41NTEzOTJdLFswLjA3MDkwNiwwLjI5NTc1MywxLjM3NzE4NV0sWy0xLjkzNTg4LDcuNjMxNzY0LDAuNjUxNjc0XSxbLTIuNTIzNTMxLDAuNzQ0ODE4LC0wLjMwOTg1XSxbMi44OTE0OTYsMy4zMTk4NzUsMi45ODMwNzldLFs0Ljc4MTc2NSwxLjU0NzA2MSwxLjUyMzEyOV0sWy0yLjI1NjA2NCw3LjU3MTI1MSwwLjk3MzcxNl0sWzMuMjQ0ODYxLDMuMDU4MjQ5LDIuNzI0MzkyXSxbLTAuMTQ1ODU1LDAuNDM3Nzc1LDMuNDMzNjYyXSxbMS41ODYyOTYsNS42NTg1MzgsMi4zNTg0ODddLFszLjY1ODMzNiwzLjc3NDkyMSwyLjA3MTgzN10sWzIuODQwNDYzLDQuODE3MDk4LDIuNDYzNzZdLFstMS4yMTk0NjQsOC4xMjI1NDIsLTAuNjcyODA4XSxbLTIuNTIwOTA2LDIuNjY0NDg2LC0xLjAzNDM0Nl0sWy0xLjMxNTQxNyw4LjQ3MTM2NSwtMC43MDk1NTddLFszLjQyOTE2NSwzLjc0Njg2LDIuNDQ2MTY5XSxbMy4wNzQ1NzksMy44NDA3NTgsMi43Njc0MDldLFszLjU2OTQ0MywzLjE2NjMzNywyLjMzMzY0N10sWzIuMjk0MzM3LDMuMjgwMDUxLDMuMzU5MzQ2XSxbMi4yMTgxNiwzLjY2NTc4LDMuMjY5MjIyXSxbMi4xNTg2NjIsNC4xNTE0NDQsLTEuMzU3OTE5XSxbMS4xMzg2Miw0LjM4MDk4NiwtMS40MDQ1NjVdLFszLjM4ODM4MiwyLjc0OTkzMSwtMC44NDA5NDldLFszLjA1OTg5Miw1LjA4NDg0OCwyLjAyNjA2Nl0sWzMuMjA0NzM5LDIuMDc1MTQ1LDIuNjQwNzA2XSxbMy4zODcwNjUsMS40MjYxNywyLjMwNTI3NV0sWzMuOTEwMzk4LDIuNjcwNzQyLDEuNzUwMTc5XSxbMy40NzE1MTIsMS45NDU4MjEsMi4zOTU4ODFdLFs0LjA4MDgyLDEuMDcwNjU0LDEuOTYwMTcxXSxbLTEuMDU3ODYxLDAuMTMzMDM2LDIuMTQ2NzA3XSxbLTAuMTUxNzQ5LDUuNTM1NTEsLTAuNjI0MzIzXSxbMy4yMzMwOTksNC4wMDM3NzgsMi41NzExNzJdLFsyLjYxMTcyNiw1LjMxOTE5OSwtMC40OTkzODhdLFsyLjY4MjkwOSwxLjA5NDQ5OSwtMS4yMDYyNDddLFstMS4yMjgyMyw3LjY1Njg4NywwLjA0MTQwOV0sWy0yLjI5MzI0Nyw3LjI1OTE4OSwwLjAxMzg0NF0sWzAuMDgxMzE1LDAuMjAyMTc0LDMuMjg2MzgxXSxbLTEuMDAyMDM4LDUuNzk0NDU0LC0wLjE4NzE5NF0sWzMuNDQ4ODU2LDQuMDgwOTEsMi4yNTgzMjVdLFswLjI4Nzg4Myw5LjAwNjg4OCwtMS41NTA2NDFdLFstMy44NTEwMTksNC4wNTk4MzksLTAuNjQ2OTIyXSxbMy42MTA5NjYsNC4yMDU0MzgsMS45MTMxMjldLFsyLjIzOTA0MiwyLjk1MDg3MiwzLjQ0OTk1OV0sWzAuMjE2MzA1LDAuNDQyODQzLDMuMzI4MDUyXSxbMS44NzE0MSwyLjQ3MDc0NSwzLjU3NDU1OV0sWzMuODExMzc4LDIuNzY4NzE4LC0wLjIyODM2NF0sWzIuNTExMDgxLDEuMzYyNzI0LDIuOTY5MzQ5XSxbLTEuNTk4MTMsNy44NjY1MDYsMC40NDAxODRdLFstMy4zMDc5NzUsMi44NTEwNzIsLTAuODk0OTc4XSxbLTAuMTA3MDExLDguOTA1NzMsLTAuODg0Mzk5XSxbLTMuODU1MzE1LDIuODQyNTk3LC0wLjQzNDU0MV0sWzIuNTE3ODUzLDEuMDkwNzY4LDIuNzk5Njg3XSxbMy43OTE3MDksMi4zNjY4NSwyLjAwMjcwM10sWzQuMDYyOTQsMi43NzM5MjIsMC40NTI3MjNdLFstMi45NzMyODksNy42MTcwMywtMC42MjM2NTNdLFstMi45NTUwOSw4LjkyNDQ2MiwtMy40NDYzMTldLFsyLjg2MTQwMiwwLjU2MjU5MiwyLjE4NDM5N10sWy0xLjEwOTcyNSw4LjU5NDIwNiwtMC4wNzY4MTJdLFstMC43MjU3MjIsNy45MjQ0ODUsLTAuMzgxMTMzXSxbLTEuNDg1NTg3LDEuMzI5OTk0LC0wLjY1NDQwNV0sWy00LjM0MjExMywzLjIzMzczNSwxLjc1MjkyMl0sWy0yLjk2ODA0OSw3Ljk1NTUxOSwtMi4wOTQwNV0sWy0zLjEzMDk0OCwwLjQ0NjE5NiwwLjg1Mjg3XSxbLTQuOTU4NDc1LDUuNzU3MzI5LDEuNDQ3MDU1XSxbLTMuMDg2NTQ3LDcuNjE1MTkzLC0xLjk1MzE2OF0sWy0zLjc1MTkyMyw1LjQxMjgyMSwzLjM3MzM3M10sWy00LjU5OTY0NSw3LjQ4MDk1MywxLjY3NzEzNF0sWzEuMTMzOTkyLDAuMjc0ODcxLDAuMDMyMjQ5XSxbLTIuOTU2NTEyLDguMTI2OTA1LC0xLjc4NTQ2MV0sWy0wLjk2MDY0NSw0LjczMDY1LC0xLjE5MTc4Nl0sWy0yLjg3MTA2NCwwLjg3NTU1OSwwLjQyNDg4MV0sWy00LjkzMjExNCw1Ljk5NjE0LDEuNDgzODQ1XSxbLTIuOTgxNzYxLDguMTI0NjEyLC0xLjM4NzI3Nl0sWzAuMzYyMjk4LDguOTc4NTQ1LC0xLjM2ODAyNF0sWy00LjQwODM3NSwzLjA0NjI3MSwwLjYwMjM3M10sWzIuODY1ODQxLDIuMzIyMjYzLC0xLjM0NDYyNV0sWy00Ljc4NDgsNS42MjA4OTUsMC41OTQ0MzJdLFstMi44ODMyMiwwLjMzODkzMSwxLjY3MjMxXSxbLTQuNjg4MTAxLDYuNzcyOTMxLDEuODcyMzE4XSxbLTQuOTAzOTQ4LDYuMTY0Njk4LDEuMjcxMzVdLFsyLjg1NjYzLDEuMDA1NjQ3LC0wLjkwNjg0M10sWzIuNjkxMjg2LDAuMjA5ODExLDAuMDUwNTEyXSxbLTQuNjkzNjM2LDYuNDc3NTU2LDAuNjY1Nzk2XSxbLTQuNDcyMzMxLDYuODYxMDY3LDAuNDc3MzE4XSxbMC44ODMwNjUsMC4yMDQ5MDcsMy4wNzM5MzNdLFstMC45OTU4NjcsOC4wNDg3MjksLTAuNjUzODk3XSxbLTAuNzk0NjYzLDUuNjcwMzk3LC0wLjM5MDExOV0sWzMuMzEzMTUzLDEuNjM4MDA2LC0wLjcyMjI4OV0sWy00Ljg1NjQ1OSw1LjM5NDc1OCwxLjAzMjU5MV0sWy0zLjAwNTQ0OCw3Ljc4MzAyMywtMC44MTk2NDFdLFszLjExODkxLDIuMDM2OTc0LC0xLjA4Njg5XSxbLTIuMzY0MzE5LDIuNDA4NDE5LDIuNjM0MTldLFstMi45MjcxMzIsOC43NTQzNSwtMy41MzcxNTldLFstMy4yOTYyMjIsNy45NjQ2MjksLTMuMTM0NjI1XSxbLTEuNjQyMDQxLDQuMTM0MTcsLTEuMzAxNjY1XSxbMi4wMzA3NTksMC4xNzYzNzIsLTEuMDMwOTIzXSxbLTQuNTU5MDY5LDMuNzUxMDUzLDAuNTQ4NDUzXSxbMy40MzgzODUsNC41OTQ1NCwtMC4yNDMyMTVdLFstMi41NjE3NjksNy45MzkzNSwwLjE3NzY5Nl0sWzIuOTkwNTkzLDEuMzM1MzE0LC0wLjk0MzE3N10sWzEuMjgwOCwwLjI3NjM5NiwtMC40OTA3Ml0sWy0wLjMxODg4OSwwLjI5MDY4NCwwLjIxMTE0M10sWzMuNTQ2MTQsMy4zNDI2MzUsLTAuNzY3ODc4XSxbLTMuMDczMzcyLDcuNzgwMDE4LC0yLjM1NzgwN10sWy00LjQ1NTM4OCw0LjM4NzI0NSwwLjM2MTAzOF0sWy00LjY1OTM5Myw2LjI3NjA2NCwyLjc2NzAxNF0sWzAuNjM2Nzk5LDQuNDgyMjIzLC0xLjQyNjI4NF0sWy0yLjk4NzY4MSw4LjA3Mjk2OSwtMi40NTI0NV0sWy0yLjYxMDQ0NSwwLjc2MzU1NCwxLjc5MjA1NF0sWzMuMzU4MjQxLDIuMDA2NzA3LC0wLjgwMjk3M10sWy0wLjQ5ODM0NywwLjI1MTU5NCwwLjk2Mjg4NV0sWzMuMTMyMiwwLjY4MzMxMiwyLjAzODc3N10sWy00LjM4OTgwMSw3LjQ5Mzc3NiwwLjY5MDI0N10sWzAuNDMxNDY3LDQuMjIxMTksLTEuNjE0MjE1XSxbLTQuMzc2MTgxLDMuMjEzMTQxLDAuMjczMjU1XSxbLTQuODcyMzE5LDUuNzE1NjQ1LDAuODI5NzE0XSxbLTQuODI2ODkzLDYuMTk1MzM0LDAuODQ5OTEyXSxbMy41MTY1NjIsMi4yMzczMiwtMC42Nzc1OTddLFszLjEzMTY1NiwxLjY5ODg0MSwtMC45NzU3NjFdLFstNC43NTQ5MjUsNS40MTE2NjYsMS45ODkzMDNdLFstMi45ODcyOTksNy4zMjA3NjUsLTAuNjI5NDc5XSxbLTMuNzU3NjM1LDMuMjc0ODYyLC0wLjc0NDAyMl0sWzMuNDg3MDQ0LDIuNTQxOTk5LC0wLjY5OTkzM10sWy00LjUzMjc0LDQuNjQ5NTA1LDAuNzcwOTNdLFstMS40MjQxOTIsMC4wOTk0MjMsMi42MzMzMjddLFszLjA5MDg2NywyLjQ3Njk3NSwtMS4xNDY5NTddLFstMi43MTMyNTYsMC44MTU2MjIsMi4xNzMxMV0sWzMuMzQ4MTIxLDMuMjU0MTY3LC0wLjk4NDg5Nl0sWy0zLjAzMTM3OSwwLjE2NDUzLC0wLjMwOTkzN10sWy0wLjk0OTc1Nyw0LjUxODEzNywtMS4zMDkxNzJdLFstMC44ODk1MDksMC4wOTUyNTYsMS4yODg4MDNdLFszLjUzOTU5NCwxLjk2NjEwNSwtMC41NTM5NjVdLFstNC42MDYxMiw3LjEyNzc0OSwwLjgxMTk1OF0sWy0yLjMzMjk1MywxLjQ0NDcxMywxLjYyNDU0OF0sWzMuMTM2MjkzLDIuOTU4MDUsLTEuMTM4MjcyXSxbMy41NDA4MDgsMy4wNjkwNTgsLTAuNzM1Mjg1XSxbMy42Nzg4NTIsMi4zNjIzNzUsLTAuNDUyNTQzXSxbLTQuNjQ4ODk4LDcuMzc0MzgsMC45NTQ3OTFdLFstMC42NDY4NzEsMC4xOTAzNywzLjM0NDc0Nl0sWzIuMjgyNSwwLjI5MzQzLC0wLjgyNjI3M10sWy00LjQyMjI5MSw3LjE4Mzk1OSwwLjU1NzUxN10sWy00LjY5NDY2OCw1LjI0NjEwMywyLjU0MTc2OF0sWy00LjU4MzY5MSw0LjE0NTQ4NiwwLjYwMDIwN10sWy0yLjkzNDg1NCw3LjkxMjUxMywtMS41MzkyNjldLFstMy4wNjc4NjEsNy44MTc0NzIsLTAuNTQ2NTAxXSxbMy44MjUwOTUsMy4yMjk1MTIsLTAuMjM3NTQ3XSxbMi41MzI0OTQsMC4zMjMwNTksMi4zODcxMDVdLFstMi41MTQ1ODMsMC42OTI4NTcsMS4yMzU5N10sWy00LjczNjgwNSw3LjIxNDM4NCwxLjI1OTQyMV0sWy0yLjk4MDcxLDguNDA5OTAzLC0yLjQ2ODE5OV0sWzIuNjIxNDY4LDEuMzg1ODQ0LC0xLjQwNjM1NV0sWzMuODExNDQ3LDMuNTYwODU1LDEuODQ3ODI4XSxbMy40MzI5MjUsMS40OTcyMDUsLTAuNDg5Nzg0XSxbMy43NDY2MDksMy42MzE1MzgsLTAuMzkwNjddLFszLjU5NDkwOSwyLjgzMjI1NywtMC41NzYwMTJdLFstMC40MDQxOTIsNS4zMDAxODgsLTAuODU2NTYxXSxbLTQuNzYyOTk2LDYuNDgzNzc0LDEuNzAyNjQ4XSxbLTQuNzU2NjEyLDYuNzg2MjIzLDEuNDM2ODJdLFstMi45NjUzMDksOC40MzcyMTcsLTIuNzg1NDk1XSxbMi44NjM4NjcsMC43NDA4NywtMC40Mjk2ODRdLFs0LjAyNTAzLDIuOTY4NzUzLDEuMzkyNDE5XSxbMy42NjkwMzYsMS44MzM4NTgsLTAuMzA0OTcxXSxbLTIuODg4ODY0LDAuNzIwNTM3LDAuNzc4MDU3XSxbLTIuMzY5ODIsMC45Nzk0NDMsMS4wNTQ0NDddLFstMi45NTkyNTksOC4yMjIzMDMsLTIuNjU5NzI0XSxbLTMuNDY3ODI1LDcuNTQ1NzM5LC0yLjMzMzQ0NV0sWzIuMTUzNDI2LDAuNDQ2MjU2LC0xLjIwNTIzXSxbLTMuMjI5ODA3LDkuMTg5Njk5LC0zLjU5NjYwOV0sWy0zLjcyNDg2LDguNzczNzA3LC0yLjA0NjY3MV0sWzMuNjg3MjE4LDMuMjk3NzUxLC0wLjUyMzc0Nl0sWzEuMzgxMDI1LDAuMDg4MTUsLTEuMTg1NjY4XSxbLTIuNzk2ODI4LDcuMjA1NjIyLC0wLjIwODc4M10sWzMuNjQ3MTk0LDQuMDY2MjMyLC0wLjI5MTUwN10sWy00LjU3ODM3NiwzLjg4NTU1NiwxLjUyNTQ2XSxbLTIuODQwMjYyLDAuNjMwOTQsMS44OTQ5OV0sWy0yLjQyOTUxNCwwLjkyMjExOCwxLjgyMDc4MV0sWy00LjY3NTA3OSw2LjU3MzkyNSwyLjQyMzM2M10sWzIuODA2MjA3LDQuMzIwMTg4LC0xLjAyNzM3Ml0sWy0xLjI4OTYwOCwwLjA5NzI0MSwxLjMyMTY2MV0sWy0zLjAxMDczMSw4LjE0MTMzNCwtMi44NjYxNDhdLFszLjIwMjI5MSwxLjIzNTYxNywtMC41NDkwMjVdLFs0LjA5NDc5MiwyLjQ3NzUxOSwwLjMwNDU4MV0sWzIuOTQ4NDAzLDAuOTY2ODczLC0wLjY2NDg1N10sWy00LjgzMjk3LDUuOTIwNTg3LDIuMDk1NDYxXSxbLTIuMTY5NjkzLDcuMjU3Mjc3LDAuOTQ2MTg0XSxbLTEuMzM1ODA3LDMuMDU3NTk3LC0xLjMwMzE2Nl0sWy0xLjAzNzg3NywwLjY0MTUxLC0xLjY4NTI3MV0sWzIuNjI3OTE5LDAuMDg5ODE0LDAuNDM5MDc0XSxbMy44MTU3OTQsMy44MDgxMDIsMS43MzA0OTNdLFstMi45NzM0NTUsOC40MzMxNDEsLTMuMDg4NzJdLFstMi4zOTE1NTgsNy4zMzE0MjgsMS42NTgyNjRdLFstNC4zMzMxMDcsNC41Mjk5NzgsMS44NTA1MTZdLFstNC42NDAyOTMsMy43NjcxMDcsMS4xNjg4NDFdLFszLjYwMDcxNiw0LjQ2OTMxLDEuNzM0MDI0XSxbMy44ODA4MDMsMS43MzAxNTgsLTAuMTcyNzM2XSxbMy44MTQxODMsNC4yNjIzNzIsMS4xNjcwNDJdLFs0LjM3MzI1LDAuODI5NTQyLDEuNDEzNzI5XSxbMi40OTA0NDcsNS43NTExMSwwLjAxMTQ5Ml0sWzMuNDYwMDAzLDQuOTYyNDM2LDEuMTg4OTcxXSxbMy45MTg0MTksMy44MTQyMzQsMS4zNTgyNzFdLFstMC44MDc1OTUsOC44NDA1MDQsLTAuOTUzNzExXSxbMy43NTI4NTUsNC4yMDU3NywxLjU3MTc3XSxbLTIuOTkxMDg1LDguODE2NTAxLC0zLjI0NDU5NV0sWy0yLjMzMzE5Niw3LjEyODg4OSwxLjU1MTk4NV0sWzMuOTc3NzE4LDMuNTcwOTQxLDEuMjU5MzddLFs0LjM2MDA3MSwwLjc1NTU3OSwxLjA3OTkxNl0sWzQuNjM3NTc5LDEuMDI3OTczLDEuMDMyNTY3XSxbLTIuMzE3LDcuNDIxMDY2LDEuMzI5NTg5XSxbLTEuMDEzNDA0LDguMjkzNjYyLC0wLjc4MjNdLFs0LjU0ODAyMywxLjAyMDY0NCwxLjQyMDQ2Ml0sWzQuNzYzMjU4LDEuMjY2Nzk4LDEuMjk2MjAzXSxbNC44OTYsMi4wNzMwODQsMS4yNTUyMTNdLFs0LjAxNTAwNSwzLjMyNTIyNiwxLjA5Mzg3OV0sWzQuOTQ4ODUsMS44NjA5MzYsMC44OTQ0NjNdLFstMi4xODk2NDUsNi45NTQ2MzQsMS4yNzAwNzddLFs0Ljg4NzQ0MiwxLjcyMDk5MiwxLjI4ODUyNl0sWy0zLjE4NDA2OCw3Ljg3MTgwMiwwLjk1NjE4OV0sWy0xLjI3NDMxOCwwLjgzOTg4NywtMS4yMjQzODldLFstMi45MTk1MjEsNy44NDQzMiwwLjU0MTYyOV0sWy0yLjk5NDU4Niw3Ljc2NjEwMiwxLjk2ODY3XSxbLTMuNDE3NTA0LDkuMjQxNzE0LC0zLjA5MzIwMV0sWy0zLjE3NDU2Myw3LjQ2NjQ1NiwyLjQ3MzYxN10sWy0zLjI2MzA2Nyw5LjA2OTQxMiwtMy4wMDM0NTldLFstMi44NDE1OTIsMC41Mjk4MzMsMi42OTM0MzRdLFstMy42MTEwNjksOS4xNTg4MDQsLTIuODI5ODcxXSxbLTQuNjQyODI4LDUuOTI3NTI2LDAuMzIwNTQ5XSxbLTMuODA5MzA4LDkuMDUxMDM1LC0yLjY5Mjc0OV0sWy0yLjgzNzU4Miw3LjQ4Nzk4NywtMC4xMDYyMDZdLFs0Ljc3MzAyNSwyLjMzMDQ0MiwxLjIxMzg5OV0sWzQuODk3NDM1LDIuMjA5OTA2LDAuOTY2NjU3XSxbLTMuMDY3NjM3LDguMTY0MDYyLC0xLjEyNjYxXSxbLTMuMTIyMTI5LDguMDgwNzQsLTAuODk5MTk0XSxbNC41NzEwMTksMi4zNTgxMTMsMS40NjIwNTRdLFs0LjU4NDg4NCwyLjQ1NDQxOCwwLjcwOTQ2Nl0sWy0zLjY2MTA5Myw3LjE0NjU4MSwtMC40NzU5NDhdLFs0LjczNTEzMSwyLjQxNTg1OSwwLjkzMzkzOV0sWzQuMjA3NTU2LDIuNTQwMDE4LDEuMjE4MjkzXSxbLTMuNjA3NTk1LDcuODkxNjEsLTAuMTIxMTcyXSxbLTEuNTI3OTUyLDAuNzc1NTY0LC0xLjA2MTkwM10sWzQuNTM4NzQsMi41MDMyNzMsMS4wOTk1ODNdLFstMy45Mzg4MzcsNy41ODc5ODgsMC4wODI0NDldLFstNC44NTM1ODIsNi4xNTI0MDksMS43ODc5NDNdLFstNC43NTIyMTQsNi4yNDcyMzQsMi4yOTY4NzNdLFs0LjYwMjkzNSwyLjM2Mzk1NSwwLjQ4ODkwMV0sWy0xLjgxNjM4LDYuMzY1ODc5LDAuODY4MjcyXSxbMC41OTU0NjcsNC43NDQwNzQsLTEuMzI0ODNdLFsxLjg3NjM1LDMuNTExOTg2LC0xLjg0MjkyNF0sWzQuMzMwOTQ3LDIuNTM0MzI2LDAuNzIwNTAzXSxbNC4xMDg3MzYsMi43NTA4MDUsMC45MDQ1NTJdLFstMS44OTA5MzksOC40OTI2MjgsLTAuMjkwNzY4XSxbLTMuNTA0MzA5LDYuMTczMDU4LC0wLjQyMjgwNF0sWy0xLjYxMTk5Miw2LjE5NjczMiwwLjY0ODczNl0sWy0zLjg5OTE0OSw3LjgyNjEyMywxLjA4ODg0NV0sWy0zLjA3ODMwMywzLjAwODgxMywtMS4wMzU3ODRdLFstMi43OTg5OTksNy44NDQ4OTksMS4zNDAwNjFdLFstMS4yNDg4MzksNS45NTkxMDUsMC4wNDE3NjFdLFswLjc2Nzc3OSw0LjMzNzMxOCwzLjA5MDgxN10sWy0zLjgzMTE3Nyw3LjUxNTYwNSwyLjQzMjI2MV0sWy0xLjY2NzUyOCw2LjE1NjIwOCwwLjM2NTI2N10sWy0xLjcyNjA3OCw2LjIzNzM4NCwxLjEwMDA1OV0sWy0zLjk3MjAzNyw0LjUyMDgzMiwtMC4zNzA3NTZdLFstNC40MDQ0OSw3LjYzNjM1NywxLjUyMDQyNV0sWy0xLjM0NTA2LDYuMDA0MDU0LDEuMjkzMTU5XSxbLTEuMjMzNTU2LDYuMDQ5OTMzLDAuNTAwNjUxXSxbLTMuNjk2ODY5LDcuNzk3MzIsMC4zNzk3OV0sWy0zLjMwNzc5OCw4Ljk0OTk2NCwtMi42OTgxMTNdLFstMS45OTcyOTUsNi42MTUwNTYsMS4xMDM2OTFdLFstMy4yMTkyMjIsOC4zMzYzOTQsLTEuMTUwNjE0XSxbLTMuNDUyNjIzLDguMzE4NjYsLTAuOTQxN10sWy0zLjk0NjQxLDIuOTkwNDk0LDIuMjEyNTkyXSxbLTMuMjUwMDI1LDguMDMwNDE0LC0wLjU5NjA5N10sWy0yLjAyMzc1LDEuNTcxMzMzLDIuMzk3OTM5XSxbLTMuMTkwMzU4LDcuNjY1MDEzLDIuMjY4MTgzXSxbLTIuODExOTE4LDcuNjE4NTI2LDIuMTQ1NTg3XSxbLTEuMDA1MjY1LDUuODkyMzAzLDAuMDcyMTU4XSxbLTAuOTM3MjEsNS45NzQxNDgsMC45MDY2NjldLFstNC42NDYwNzIsNy40OTIxOTMsMS40NTMxMl0sWy0wLjI1MjkzMSwxLjc5NzY1NCwzLjE0MDYzOF0sWy0xLjA3NjA2NCw1LjczODQzMywxLjY5NTk1M10sWy0zLjk4MDUzNCw3Ljc0NDM5MSwxLjczNTc5MV0sWy0wLjcyMTE4Nyw1LjkzOTM5NiwwLjUyNjAzMl0sWy0wLjQyODE4LDUuOTE5NzU1LDAuMjI5MDAxXSxbLTEuNDM0MjksNi4xMTYyMiwwLjkzODYzXSxbLTAuOTg1NjM4LDUuOTM5NjgzLDAuMjkwNjM2XSxbLTQuNDMzODM2LDcuNDYxMzcyLDEuOTY2NDM3XSxbLTMuNjk2Mzk4LDcuODQ0ODU5LDEuNTQ3MzI1XSxbLTMuMzkwNzcyLDcuODIwMTg2LDEuODEyMjA0XSxbLTIuOTE2Nzg3LDcuODY0MDE5LDAuODA0MzQxXSxbLTMuNzE1OTUyLDguMDM3MjY5LC0wLjU5MTM0MV0sWy00LjIwNDYzNCw3LjcyOTE5LDEuMTE5ODY2XSxbLTQuNTkyMjMzLDUuNTkyODgzLDAuMjQ2MjY0XSxbMy4zMDcyOTksNS4wNjE3MDEsMS42MjI5MTddLFstMy41MTUxNTksNy42MDE0NjcsMi4zNjg5MTRdLFstMy40MzU3NDIsOC41MzM0NTcsLTEuMzc5MTZdLFstMC4yNjk0MjEsNC41NDU2MzUsLTEuMzY2NDQ1XSxbLTIuNTQyMTI0LDMuNzY4NzM2LC0xLjI1ODUxMl0sWy0zLjAzNDAwMyw3Ljg3Mzc3MywxLjI1Njg1NF0sWy0yLjgwMTM5OSw3Ljg1NjAyOCwxLjA4MDEzN10sWzMuMjkzNTQsNS4yMjA4OTQsMS4wODE3NjddLFstMi4zNTEwOSwxLjI5OTQ4NiwxLjAxMjA2XSxbLTMuMjMyMjEzLDcuNzY4MTM2LDIuMDQ3NTYzXSxbMy4yOTA0MTUsNS4yMTc1MjUsMC42ODAxOV0sWy0zLjQxNTEwOSw3LjczMTAzNCwyLjE0NDMyNl0sWzMuNDQwMzU3LDQuOTYyNDYzLDAuMzczMzg3XSxbMy4xNDczNDYsNS4zNTIxMjEsMS4zODY5MjNdLFsyLjg0NzI1Miw1LjQ2OTA1MSwxLjgzMTk4MV0sWzMuMTM3NjgyLDUuNDEwMjIyLDEuMDUwMTg4XSxbMy4xMDI2OTQsNS4zMTA0NTYsMS42NzY0MzRdLFstMy4wNDQ2MDEsMC4zOTUxNSwxLjk5NDA4NF0sWzIuOTAzNjQ3LDUuNTYxMzM4LDEuNTE4NTk4XSxbLTMuODEwMTQ4LDguMDkzNTk4LC0wLjg4OTEzMV0sWzQuMjM0ODM1LDAuODAzMDU0LDEuNTkzMjcxXSxbMy4yNDAxNjUsNS4yMjg3NDcsMC4zMjU5NTVdLFszLjAzNzQ1Miw1LjUwOTgyNSwwLjgxNzEzN10sWzIuNjM1MDMxLDUuNzk1MTg3LDEuNDM5NzI0XSxbMy4wNzE2MDcsNS4zMTgzMDMsMC4wODAxNDJdLFsyLjkwOTE2Nyw1LjYxMTc1MSwxLjE1NTg3NF0sWzMuMDQ0ODg5LDUuNDY1OTI4LDAuNDg2NTY2XSxbMi41MDIyNTYsNS43NzA2NzMsMS43NDAwNTRdLFstMC4wNjc0OTcsMC4wODY0MTYsLTEuMTkwMjM5XSxbMi4zMzMyNiw1LjkwNjA1MSwwLjEzODI5NV0sWzAuNjUwOTYsNC4yMDU0MjMsMy4zMDg3NjddLFstMi42NzExMzcsNy45MzY1MzUsMC40MzI3MzFdLFsyLjE0NDYzLDUuODc5MjE0LDEuODY2MDQ3XSxbLTQuNzc2NDY5LDUuODkwNjg5LDAuNTYxOTg2XSxbMi43MjQzMiw1LjY1NTE0NSwwLjIxMTk1MV0sWzIuNzMwNDg4LDUuNzUxNDU1LDAuNjk1ODk0XSxbMi41NzI2ODIsNS44NjkyOTUsMS4xNTI2NjNdLFsxLjkwNjc3Niw1LjczOTEyMywyLjE5NjU1MV0sWzIuMzQ0NDE0LDUuOTk5OTYxLDAuNzcyOTIyXSxbLTMuMzc3OTA1LDcuNDQ4NzA4LC0xLjg2MzI1MV0sWzIuMjg1MTQ5LDUuOTY4MTU2LDEuNDU5MjU4XSxbMi4zODU5ODksNS45Mjg5NzQsMC4zNjg5XSxbMi4xOTIxMTEsNi4wODc1MTYsMC45NTk5MDFdLFsyLjM2MzcyLDYuMDAxMTAxLDEuMDc0MzQ2XSxbMS45NzIwMjIsNi4wNzk2MDMsMS41OTExNzVdLFsxLjg3NjE1LDUuOTc2Njk4LDEuOTE1NTRdLFstMy44MjQ3NjEsOS4wNTM3MiwtMi45Mjg2MTVdLFsyLjA0NDcwNCw2LjEyOTcwNCwxLjI2MzExMV0sWy0yLjU4MzA0NiwwLjg0OTUzNywyLjQ5NzM0NF0sWy0wLjA3ODgyNSwyLjM0MjIwNSwzLjUyMDMyMl0sWy0wLjcwNDY4NiwwLjUzNzE2NSwzLjM5NzE5NF0sWy0wLjI1NzQ0OSwzLjIzNTMzNCwzLjY0NzU0NV0sWy0wLjMzMjA2NCwxLjQ0ODI4NCwzLjAyMjU4M10sWy0yLjIwMDE0NiwwLjg5ODI4NCwtMC40NDcyMTJdLFstMi40OTc1MDgsMS43NDU0NDYsMS44MjkxNjddLFswLjMwNzAyLDQuNDE2MzE1LDIuOTc4OTU2XSxbLTMuMjA1MTk3LDMuNDc5MzA3LC0xLjA0MDU4Ml0sWzAuMTEwMDY5LDkuMzQ3NzI1LC0xLjU2MzY4Nl0sWy0wLjgyNzU0LDAuODgzODg2LDMuMDY1ODM4XSxbLTIuMDE3MTAzLDEuMjQ0Nzg1LDIuNDI1MTJdLFstMC40MjEwOTEsMi4zMDk5MjksMy4xNTM4OThdLFstMC40OTE2MDQsMy43OTYwNzIsMy4xNjI0NV0sWzIuNzg2OTU1LDMuNTAxMjQxLC0xLjM0MDIxNF0sWy0zLjIyOTA1NSw0LjM4MDcxMywtMC44OTkyNDFdLFszLjczMDc2OCwwLjc2ODQ1LDEuOTAzMTJdLFstMC41NjEwNzksMi42NTIzODIsMy4xNTI0NjNdLFstMy40NjE0NzEsMy4wODY0OTYsMi42NjI1MDVdLFstMC42NjE0MDUsMy40NDYwMDksMy4xNzk5MzldLFstMC45MTUzNTEsMC42MzY3NTUsMy4yNDM3MDhdLFstMi45OTI5NjQsOC45MTU2MjgsLTMuNzI5ODMzXSxbLTAuNDM5NjI3LDMuNTAyMTA0LDMuNDI2NjVdLFstMS4xNTQyMTcsMC44ODMxODEsMi44MDA4MzVdLFstMS43MzYxOTMsMS40NjU0NzQsMi41OTU0ODldLFstMC40MjM5MjgsMy4yNDQzNSwzLjU0ODI3N10sWy0wLjUxMTE1MywyLjg3MTA0NiwzLjM3OTc0OV0sWy0wLjY3NTcyMiwyLjk5MTc1NiwzLjE0MzI2Ml0sWy0xLjA5MjYwMiwwLjU5OTEwMywzLjA5MDYzOV0sWy0wLjg5ODIxLDIuODM2OTUyLDIuODQwMDIzXSxbLTIuNjU4NDEyLDAuNzgxMzc2LDAuOTYwNTc1XSxbLTIuMjcxNDU1LDEuMjIyODU3LDEuMzMwNDc4XSxbLTAuODc3ODYxLDEuMTExMjIyLDIuNzIyNjNdLFstMC4zMDY5NTksMi44NzY5ODcsMy41NTYwNDRdLFstMy44MzkyNzQsNy44NDEzOCwtMC45MTg0MDRdLFstMC4xNzIwOTQsNC4wODM3OTksMy4xNDE3MDhdLFstMS41NDgzMzIsMC4yNTI5LDIuODY0NjU1XSxbLTAuMjE3MzUzLDQuODczOTExLC0xLjIyMzEwNF0sWy0zLjM4NDI0MiwzLjE4MTA1NiwtMC45NTU3OV0sWy0yLjczMTcwNCwwLjM4MjQyMSwyLjg5NTUwMl0sWy0xLjI4NTAzNywwLjU1MTI2NywyLjk0NzY3NV0sWzAuMDc3MjI0LDQuMjQ2NTc5LDMuMDY2NzM4XSxbLTAuNDc5OTc5LDEuNzc5NTUsMi44NjAwMTFdLFstMC43MTYzNzUsMS4yMjQ2OTQsMi42NjY3NTFdLFstMC41NDYyMiwzLjEzODI1NSwzLjM5MzQ1N10sWy0yLjMzNDEzLDEuODIxMjIyLDIuMTI0ODgzXSxbLTAuNTA2NTMsMi4wMzcxNDcsMi44OTc0NjVdLFsyLjQ1MTI5MSwxLjIxMTM4OSwtMS40NjY1ODldLFstMy4xNjAwNDcsMi44OTQwODEsMi43MjQyODZdLFstNC4xMzcyNTgsNS40MzM0MzEsMy4yMTIwMV0sWzAuNDYyODk2LDAuMzIwNDU2LC0wLjE3NDgzN10sWy0wLjM3NDU4LDIuNjA5NDQ3LDMuMzc5MjUzXSxbLTMuMDk1MjQ0LDAuMjU2MjA1LDIuMTk2NDQ2XSxbLTQuMTk3OTg1LDUuNzMyOTkxLDMuMjYyOTI0XSxbLTAuNzI5NzQ3LDAuMjQ2MDM2LDAuNDk3MDM2XSxbLTIuMzU2MTg5LDUuMDYyLC0wLjk2NTYxOV0sWy0xLjYwOTAzNiwwLjI1OTYyLC0xLjQ4NzM2N10sWy00LjA3NDM4MSw2LjA3NDA2MSwzLjQwOTQ1OV0sWy0zLjYxOTMwNCw0LjAwMjIsMi42NTcwNV0sWy0wLjU0MzM5Myw4Ljc0Mjg5NiwtMS4wNTY2MjJdLFstNC4zMDM1Niw2Ljg1ODkzNCwyLjg3OTY0Ml0sWy0wLjcxNjY4OCwyLjkwMTgzMSwtMi4xMTIwMl0sWzEuNTQ3MzYyLDAuMDgzMTg5LDEuMTM4NzY0XSxbLTAuMjUwOTE2LDAuMjc1MjY4LDEuMjAxMzQ0XSxbLTMuNzc4MDM1LDMuMTM2MjQsMi40NjYxNzddLFstNC41OTQzMTYsNS43NzEzNDIsMy4wMTY5NF0sWy0zLjcxNzcwNiwzLjQ0Mjg4NywyLjYwMzM0NF0sWy00LjMxMTE2Myw1LjIyNDY2OSwzLjAxOTM3M10sWy0wLjYxMDM4OSwyLjA5NTE2MSwtMS45MjM1MTVdLFstMy4wNDAwODYsNi4xOTY5MTgsLTAuNDI5MTQ5XSxbLTMuODAyNjk1LDMuNzY4MjQ3LDIuNTQ1NTIzXSxbLTAuMTU5NTQxLDIuMDQzMzYyLDMuMzI4NTQ5XSxbLTMuNzQ0MzI5LDQuMzE3ODUsMi40OTE4ODldLFstMy4wNDc5MzksMC4yMTQxNTUsMS44NzM2MzldLFstNC40MTY4NSw2LjExMzA1OCwzLjE2Njc3NF0sWy0xLjE2NTEzMywwLjQ2MDY5MiwtMS43NDIxMzRdLFstMS4zNzEyODksNC4yNDk5OTYsLTEuMzE3OTM1XSxbLTMuNDQ3ODgzLDAuMzUyMSwwLjQ2NjIwNV0sWy00LjQ5NTU1NSw2LjQ2NTU0OCwyLjk0NDE0N10sWy0zLjQ1NTMzNSwwLjE3MTY1MywwLjM5MDgxNl0sWy0zLjk2NDAyOCw0LjAxNzE5NiwyLjM3NjAwOV0sWy0xLjMyMzU5NSwxLjc2MzEyNiwtMC43NTA3NzJdLFstMy45NzExNDIsNS4yNzc1MjQsLTAuMTk0OTZdLFstMy4yMjIwNTIsMC4yMzc3MjMsMC44NzIyMjldLFstNC40MDM3ODQsMy44OTEwNywxLjg3MjA3N10sWy0zLjMzMzMxMSwwLjM0Mjk5NywwLjY2MTAxNl0sWy00LjQ5NTg3MSw0LjI5NjA2LDEuNjM2MDhdLFstMy42MzYwODEsMi43NjA3MTEsMi4zNjE5NDldLFstNC40ODcyMzUsMy41NTk2MDgsMS42NjczN10sWy00LjcxOTc4Nyw3LjI2ODg4LDEuNjU4NzIyXSxbLTEuMDg2MTQzLDkuMDM1NzQxLC0wLjcwNzE0NF0sWy0yLjMzOTY5MywxLjYwMDQ4NSwtMC40MDQ4MTddLFstNC42NDIwMTEsNy4xMjM4MjksMS45OTA5ODddLFstMS40OTgwNzcsMy44NTQwMzUsLTEuMzY5Nzg3XSxbLTQuMTg4MzcyLDQuNzI5MzYzLDIuMDI5ODNdLFstMy4xMTYzNDQsNS44ODIyODQsLTAuNDY4ODg0XSxbLTQuMzA1MjM2LDQuMjQ2NDE3LDEuOTc2OTkxXSxbLTMuMDIyNTA5LDAuMjI4MTksMS4wNjU2ODhdLFstMi43OTk5MTYsMC41MjAyMiwxLjEyODMxOV0sWy00LjI2MjgyMywzLjUzNDQwOSwyLjAyMDM4M10sWy00LjIyMTUzMywzLjk0NzY3NiwyLjExNzM1XSxbLTMuNzQ0MzUzLDQuMzkxNzEyLC0wLjYxOTNdLFstMS4yNzI5MDUsMC4xNTY2OTQsLTEuNzQxNzUzXSxbLTMuNjI0OTEsMi42Njk4MjUsLTAuNTQ5NjY0XSxbLTQuMTgwNzU2LDMuMDk2MTc5LDEuOTg3MjE1XSxbLTQuMDU5Mjc2LDQuMzA1MzEzLDIuMjMyOTI0XSxbLTIuODEyNzUzLDAuMTgzMjI2LDEuMzcwMjY3XSxbLTQuMDMyNDM3LDMuNTEyMjM0LDIuMzA5OTg1XSxbLTAuMDM3ODcsMC4yODE4OCwwLjUzMDM5MV0sWy00LjcxMTU2Miw1LjQ2ODY1MywyLjgyMjgzOF0sWy00LjUwMDYzNiw2Ljk1MzMxNCwyLjU2NDQ0NV0sWy00LjQ3OTQzMyw3LjIxNjk5MSwyLjI3MDY4Ml0sWzMuOTkwNTYyLDAuNTA1MjIsMC43MTYzMDldLFstMi41MTIyMjksNi44NjM0NDcsLTAuMTAwNjU4XSxbLTIuOTY4MDU4LDYuOTU2NjM5LC0wLjM3MDYxXSxbMi41NTAzNzUsMy4xNDI2ODMsLTEuNTQwNjhdLFstMi4zMjAwNTksMy41MjE2MDUsLTEuMjc5Mzk3XSxbLTQuNTU2MzE5LDYuNjQ2NjIsMi43NDUzNjNdLFstNC4yODEwOTEsNy4xMDgxMTYsMi42Njc1OThdLFstMi4wNTAwOTUsOC40MTE2ODksMC4xMjEzNTNdLFstMi40NDg1NCwxLjEzNTQ4NywwLjg1MTg3NV0sWzMuMTIxODE1LDAuNjk5OTQzLC0wLjI3NzE2N10sWy00LjY5ODc3LDYuMDAzNzYsMi44NDMwMzVdLFstMS4zNjA1OTksOC44MjQ3NDIsLTAuNTk1NTk3XSxbMS4xMjg0MzcsMC4xNzE2MTEsMC4zMDE2OTFdLFstNC4zNjAxNDYsNi4yODk0MjMsMC4wNDIyMzNdLFsxLjQwMDc5NSw0LjA4ODgyOSwtMS42MjA0MDldLFstMy4xOTM0NjIsOC40NjAxMzcsLTMuNTU5NDQ2XSxbLTMuMTY4NzcxLDguODc4NDMxLC0zLjYzNTc5NV0sWy0zLjQzNDI3NSw5LjMwNDMwMiwtMy40NjA4NzhdLFstMy4zNDk5OTMsOC44MDgwOTMsLTMuMzgxNzldLFstMy4zMDQ4MjMsOC4zMjM4NjUsLTMuMzI1OTA1XSxbLTMuNTcyNjA3LDkuMzA4ODQzLC0zLjIwNzY3Ml0sWy0zLjE2NjM5Myw4LjIwMTIxNSwtMy40MzAxNF0sWy0zLjQ1MTYzOCw5LjA1MzMxLC0zLjM1MTM0NV0sWy0zLjMwOTU5MSw4LjU0OTc1OCwtMy4zNzUwNTVdLFstMy41Mjc5OTIsOC43OTM5MjYsLTMuMTAwMzc2XSxbLTMuNjI4Nyw4Ljk4MTY3NywtMy4wNzYzMTldLFstMy40NDU1MDUsOC4wMDE4ODcsLTIuODI3M10sWy0zLjQwODAxMSw4LjIyMTAxNCwtMy4wMzkyMzddLFstMy42NTkyOCw4Ljc0MDM4MiwtMi44MDg4NTZdLFstMy44NzgwMTksOC43OTcyOTUsLTIuNDYyODY2XSxbLTMuNTE1MTMyLDguMjMyMzQxLC0yLjc0NzczOV0sWy0zLjQ2MDMzMSw4LjUxNTI0LC0zLjA2ODE4XSxbLTMuNDAzNzAzLDcuNjU4NjI4LC0yLjY0ODc4OV0sWy0zLjUwNzExMyw4LjAwMTU5LC0yLjU4MjI3NV0sWy0zLjYwNzM3Myw4LjE3NDczNywtMi40MDE3MjNdLFstMy43NDkwNDMsOC4zNzgwODQsLTIuMjI2OTU5XSxbLTMuNjQ4NTE0LDguNTAyMjEzLC0yLjYxMzhdLFstMi41MzQxOTksMC45MDQ3NTMsMi4wMjExNDhdLFsxLjQwODMsNS43NDQyNTIsLTAuNTcxNDAyXSxbLTMuODUyNTM2LDguNTcxMDA5LC0yLjM1MjM1OF0sWzIuODY4MjU1LDUuMzczMTI2LC0wLjE2MzcwNV0sWzIuMjI0MzYzLDQuNjY5ODkxLC0xLjA2MTU4Nl0sWy00LjUyODI4MSw0Ljg4NTgzOCwxLjM0MDI3NF0sWzEuMzA4MTcsNC42MDk2MjksLTEuMjg3NjJdLFstNC41MTk2OTgsMy40MjI1MDEsMS4zNTQ4MjZdLFstMy41NDk5NTUsNy43ODMyMjgsLTIuMzMyODU5XSxbMS4xMjMxMyw2LjEyMDg1NiwwLjA0NTExNV0sWy0zLjYyMDMyNCw3LjU3NzE2LC0yLjAzMzQyM10sWy0wLjc5ODgzMywyLjYyNDEzMywtMS45OTI2ODJdLFstMy42MTc1ODcsNy43ODMxNDgsLTIuMDUxMzgzXSxbLTMuNjY5MjkzLDguMTAzNzc2LC0yLjEwMjI3XSxbLTMuODkyNDE3LDguNjY3NDM2LC0yLjE2NzI4OF0sWy0wLjUzNzQzNSwwLjI4NTM0NSwtMC4xNzYyNjddLFstMC44NDE1MjIsMy4yOTk4NjYsLTEuODg3ODYxXSxbLTAuNzYxNTQ3LDMuNjQ3MDgyLC0xLjc5ODk1M10sWy0zLjY2MTU0NCw3Ljg1NzA4LC0xLjg2NzkyNF0sWy0zLjg4Njc2Myw4LjU1MTc4MywtMS44ODkxNzFdLFstMC41OTEyNDQsMS41NDk3NDksLTEuNzE0Nzg0XSxbLTAuNzc1Mjc2LDEuOTA4MjE4LC0xLjU5NzYwOV0sWy0wLjk2MTQ1OCwyLjU3MzI3MywtMS42OTU1NDldLFstMi4yMTU2NzIsMS4zMzUwMDksMi4xNDMwMzFdLFstNC42MjI2NzQsNC4xMzAyNDIsMS4yMjA2ODNdLFsxLjA3MzQ0LDAuMjkwMDk5LDEuNTg0NzM0XSxbLTAuOTc2OTA2LDIuOTIxNzEsLTEuNzY2NjddLFstMS4xMzY5NiwzLjE5NDQwMSwtMS41MTM0NTVdLFstMy43NDMyNjIsNy45OTk0OSwtMS42MjkyODZdLFstMi44NzYzNTksNC45MDA5ODYsLTAuODc5NTU2XSxbMC41NTA4MzUsMy45MDU1NTcsLTIuMDMxMzcyXSxbMC43Nzc2NDcsNC45OTIzMTQsLTEuMjE1NzAzXSxbMS40NDU4ODEsNC4yNjYyMDEsLTEuNDE0NjYzXSxbMS4yNzQyMjIsNS41MTA1NDMsLTAuODI0NDk1XSxbLTAuODY0Njg1LDIuMzE4NTgxLC0xLjcwMjM4OV0sWy0wLjYyNzQ1OCwzLjgyMDcyMiwtMS43NDMxNTNdLFstMy44Njc2OTksOC4zMDg2NiwtMS44NTAwNjZdLFsxLjYzNTI4Nyw1LjQ1NTg3LC0wLjgzODQ0XSxbLTEuMDM3ODc2LDIuNTM4NTg5LC0xLjUxMzUwNF0sWy00LjM4OTkzLDQuNzM5MjYsMS42OTk2MzldLFswLjA0ODcwOSw0Ljc2NTIzMiwtMS4yNzk1MDZdLFstMC42MjY1NDgsMS4zMzk4ODcsLTEuNTk1MTE0XSxbLTMuNjgyODI3LDcuNjQzNDUzLC0xLjcyMzM5OF0sWy0zLjg2ODc4Myw4LjE4MDE5MSwtMS41MTE3NDNdLFstMC43Njk4OCwxLjUwODM3MywtMS40MTk1OTldLFstMS4xMzgzNzQsMi43NjY3NjUsLTEuNDQ4MTYzXSxbMS42OTk4ODMsNS43ODA3NTIsLTAuNDc1MzYxXSxbMS4yMTQzMDUsMC4zMDg1MTcsMS44NjY0MDVdLFstMS43MTM2NDIsMC4zNzM0NjEsLTEuMjY1MjA0XSxbLTEuNTgyMzg4LDAuNTgyOTQsLTEuMjY3OTc3XSxbLTAuODc5NTQ5LDEuODIxNTgxLC0xLjMxMzc4N10sWzAuNTE5MDU3LDUuODU4NzU3LC0wLjM4MTM5N10sWy0zLjc3MDk4OSwyLjQ0OTIwOCwtMC4xMzI2NTVdLFswLjA4NzU3NiwwLjE1NjcxMywtMS41MzYxNl0sWy0wLjk0MjYyMiwyLjE0NjUzNCwtMS40MjE0OTRdLFstMS4wMjYxOTIsMS4wMjIxNjQsLTEuMTQ1NDIzXSxbLTAuOTY0MDc5LDEuNjQ1NDczLC0xLjA2NzYzMV0sWy0xLjEwOTEyOCwyLjQ1ODc4OSwtMS4yOTEwNl0sWy0xLjAzNzQ3OCwwLjIwOTQ4OSwtMS44MDU0MjRdLFstMy43MjQzOTEsNy41OTk2ODYsLTEuMjczNDU4XSxbLTMuNzg3ODk4LDcuOTUxNzkyLC0xLjMwNDc5NF0sWzMuODIxNjc3LDIuMTY1NTgxLC0wLjE4MTUzNV0sWy0yLjM5NDY3LDAuMzA0NjA2LC0wLjU3MDM3NV0sWy0yLjM1MjkyOCwxLjA0MzksMi4wNzkzNjldLFstMC4yODg4OTksOS42NDA2ODQsLTEuMDA2MDc5XSxbLTMuNDcyMTE4LDcuMjYzMDAxLC0xLjA4MDMyNl0sWy0xLjI0MDc2OSwwLjk3MjM1MiwtMC45NzY0NDZdLFstMS44NDUyNTMsMC4zNTY4MDEsLTAuOTk1NTc0XSxbLTIuMzIyNzksNy45MTUzNjEsLTAuMDU3NDc3XSxbLTEuMDgwOTIsMi4xNzkzMTUsLTEuMTY4ODIxXSxbNC41OTg4MzMsMi4xNTY3NjgsMC4yODAyNjRdLFstNC43MjU0MTcsNi40NDIzNzMsMi4wNTY4MDldLFstMC40OTAzNDcsOS40NjQyOSwtMC45ODEwOTJdLFstMS45OTY1MiwwLjA5NzM3LC0wLjc2NTgyOF0sWy0xLjEzNzc5MywxLjg4ODg0NiwtMC44OTQxNjVdLFstMC4zNzI0Nyw0LjI5NjYxLC0xLjQ2NTE5OV0sWy0wLjE4NDYzMSw1LjY5Mjk0NiwtMC40MjEzOThdLFstMy43NTE2OTQsNy43NDIyMzEsLTEuMDg2OTA4XSxbLTEuMDAxNDE2LDEuMjk4MjI1LC0wLjkwNDY3NF0sWy0zLjUzNjg4NCw3LjE5MDc3NywtMC43ODg2MDldLFstMy43Mzc1OTcsNy41MTEyODEsLTAuOTQwMDUyXSxbLTEuNzY2NjUxLDAuNjY5Mzg4LC0wLjg3MzA1NF0sWzMuMTEyMjQ1LDMuNDc0MzQ1LC0xLjEyOTY3Ml0sWy0wLjE3NTUwNCwzLjgxMjk4LC0yLjA0NzldLFstMy43NjY3NjIsNy40MTI1MTQsLTAuNjgxNTY5XSxbLTAuNjMzNzUsOS40Mzk0MjQsLTAuNzg1MTI4XSxbLTAuNTE4MTk5LDQuNzY4OTgyLC0xLjI1ODYyNV0sWzAuNzkwNjE5LDQuMjEyNzU5LC0xLjYxMDIxOF0sWy0zLjc2MTk1MSwzLjc0MjUyOCwtMC43NTYyODNdLFswLjg5NzQ4Myw1LjY3OTgwOCwtMC42MTI0MjNdLFsyLjIyMTEyNiw0LjQyNzQ2OCwtMS4yNTIxNTVdLFstMC43Mjg1NzcsNS44NDY0NTcsMC4wNjI3MDJdLFswLjE5NDQ1MSw5LjUwMzkwOCwtMS40ODI0NjFdLFstMC4wOTkyNDMsOS4zODU0NTksLTEuMzk1NjRdLFswLjY0MzE4NSwzLjYzNjg1NSwtMi4xODAyNDddLFswLjg5NDUyMiw1LjkwMDYwMSwtMC4zNTY5MzVdLFsyLjU5NTUxNiw0Ljc1NzMxLC0wLjg5MzI0NV0sWzEuMTA4NDk3LDMuOTM2ODkzLC0xLjkwNTA5OF0sWzEuOTg5ODk0LDUuNzg5NzI2LC0wLjM0MzI2OF0sWy0zLjgwMjM0NSw3LjY1NTUwOCwtMC42MTM4MTddLFsyLjMzOTM1Myw0Ljk2MjU3LC0wLjkwMzA4XSxbMC4xMjU2NCw0LjAxMzMyNCwtMS44NzkyMzZdLFstNC4wNzg5NjUsMy42ODMyNTQsLTAuNDQ1NDM5XSxbMi4wOTI4OTksNS4yNTYxMjgsLTAuODMxNjA3XSxbMC40Mjc1NzEsMC4yOTE3NjksMS4yNzI5NjRdLFsyLjMzNTU0OSwzLjQ4MDA1NiwtMS41ODE5NDldLFstMC4xNTY4NywwLjMyNDgyNywtMS42NDg5MjJdLFstMC41MzY1MjIsNS43NjA3ODYsLTAuMjAzNTM1XSxbMS41MDcwODIsMC4wNzgyNTEsLTAuOTIzMTA5XSxbLTEuODU0NzQyLDAuMTM0ODI2LDIuNjk4Nzc0XSxbLTMuOTM5ODI3LDMuMTY4NDk4LC0wLjUyNjE0NF0sWy0zLjk4NDYxLDMuMzk4NjksLTAuNTMzMjEyXSxbLTMuOTYxNzM4LDQuMjE3MTMyLC0wLjQ4OTE0N10sWzQuMjczNzg5LDIuMTgxMTY0LDAuMTUzNzg2XSxbLTAuNDcwNDk4LDUuNjQ1NjY0LC0wLjQzOTA3OV0sWy0wLjQxNDUzOSw1LjQ4ODAxNywtMC42NzMzNzldLFstMC4wOTc0NjIsNS4wNjI3MzksLTEuMTE0ODYzXSxbMS4xOTgwOTIsNS44ODIyMzIsLTAuMzkxNjk5XSxbMi44NTU4MzQsNS4wODUwMjIsLTAuNDk4Njc4XSxbMS4wMzc5OTgsNC4xMjk3NTcsLTEuNzAxODExXSxbMS43MjgwOTEsNS4wNjg0NDQsLTEuMDYzNzYxXSxbLTMuODMyMjU4LDIuNjI1MTQxLC0wLjMxMTM4NF0sWy00LjA3ODUyNiwzLjA3MDI1NiwtMC4yODQzNjJdLFstNC4wODAzNjUsMy45NTQyNDMsLTAuNDQwNDcxXSxbLTAuMTUyNTc4LDUuMjc2MjY3LC0wLjkyOTgxNV0sWy0xLjQ4OTYzNSw4LjkyODA4MiwtMC4yOTU4OTFdLFswLjc1OTI5NCw1LjE1NTg1LC0xLjA4NzM3NF0sWy00LjAwMDMzOCwyLjgwMTY0NywtMC4yMzUxMzVdLFstNC4yOTA4MDEsMy44MjMyMDksLTAuMTkzNzRdLFstNC4yMjE0OTMsNC4yNTYxOCwtMC4xODk4OTRdLFstNC4wNjYxOTUsNC43MTkxNiwtMC4yMDE3MjRdLFstMC4xNTUzODYsNC4wNzYzOTYsLTEuNjYyODY1XSxbMy4wNTQ1NzEsNC40MTQzMDUsLTAuODI1OTg1XSxbLTEuNjUyOTE5LDguNzI2NDk5LC0wLjM4ODUwNF0sWy0zLjA0Mjc1MywwLjU2MDA2OCwtMC4xMjY0MjVdLFstMi40MzQ0NTYsMS4xMTgwODgsLTAuMjEzNTYzXSxbLTIuNjIzNTAyLDEuODQ1MDYyLC0wLjI4MzY5N10sWy00LjIzMzM3MSwzLjQzOTQxLC0wLjIwMjkxOF0sWzIuNzI2NzAyLDMuODIwNzEsLTEuMjgwMDk3XSxbMC4xODQxOTksNC4xNDYzOSwtMS42NzM2NTNdLFstMS4yODkyMDMsMC42MjQ1NjIsLTEuNTYwOTI5XSxbLTMuODIzNjc2LDcuMzgyNDU4LC0wLjQwNzIyM10sWzAuNDc2NjY3LDUuMDY0NDE5LC0xLjE0Mzc0Ml0sWy0zLjg3MzY1MSw0Ljk1NTExMiwtMC4yNjkzODldLFsxLjM0OTY2Niw1LjMxMjIyNywtMS4wMDAyNzRdLFstMi4wNDM3NzYsOC40MzQ0ODgsLTAuMTA4ODkxXSxbLTIuNzYzOTY0LDAuNzMzMzk1LC0wLjEyOTI5NF0sWy00LjM4MDUwNSwzLjY2NDQwOSwtMC4wMjQ1NDZdLFstMC43MTIxMSw1LjM0MTgxMSwtMC44MDMyODFdLFstMy45NjA4NTgsNy4xODMxMTIsLTAuMTE4NDA3XSxbLTMuODIyMjc3LDcuNzEyODUzLC0wLjI2MzIyMV0sWy0yLjM0NjgwOCw4LjEwODU4OCwwLjA2MzI0NF0sWy0xLjg0MTczMSw4LjY0Mjk5OSwtMC4xNDI0OTZdLFstMi42MDAwNTUsMC45ODU2MDQsLTAuMDQzNTk1XSxbLTMuNTEzMDU3LDIuMjEzMjQzLC0wLjA0NDE1MV0sWy0zLjk2MzQ5MiwyLjYwMzA1NSwtMC4wODA4OThdLFstNC4yNTgwNjYsMy4xNDUzNywtMC4wMjcwNDZdLFstNC4yNjE1NzIsNS4wMDMzNCwwLjEzMDA0XSxbMC43OTU0NjQsMy45OTg3MywtMS45MDU2ODhdLFstMy4zMDA4NzMsMC4zODQ3NjEsMC4wMTMyNzFdLFstMi43NzAyNDQsMC44ODE5NDIsMC4wNzczMTNdLFstMy40NTYyMjcsMS45OTM4NzEsMC4zMDEwNTRdLFstNC40NDE5ODcsMy45MTQxNDQsMC4xNzc4NjddLFstNC4zNjcwNzUsNi42MTE0MTQsMC4xNjUzMTJdLFstMy4yMDE3NjcsMC41NzYyOTIsMC4xMDU3NjldLFstMy4xNzQzNTQsMC42NDUwMDksMC40NDAzNzNdLFstMi45OTY1NzYsMC43NDI2MiwwLjE2MTMyNV0sWy0yLjcyNDk3OSwxLjY1NjQ5NywwLjA5Mjk4M10sWy0zLjI2MTc1NywyLjAxNzc0MiwtMC4wNzA3NjNdLFstNC4yODAxNzMsNC41MTgyMzUsLTAuMDAyOTk5XSxbLTQuNDcxMDczLDUuOTQ1MzU4LDAuMDUyMDJdLFstMy44NzcxMzcsMi40MDc0MywwLjI3NDkyOF0sWy00LjM3MTIxOSw0LjI1Mjc1OCwwLjA3ODAzOV0sWy0zLjQwMDkxNCwwLjQwOTgzLDAuMjM4NTk5XSxbLTQuNDQyOTMsMy41MjMyNDIsMC4xNDYzMzldLFstNC41NzQ1MjgsNS4yNzk3NjEsMC4zNTM5MjNdLFstNC4yMjY2NDMsNy4xOTEyODIsMC4yNjkyNTZdLFstNC4xNjM2MSwyLjg0MzIwNCwwLjA5NzcyN10sWy00LjUyODUwNiw1LjAxMTY2MSwwLjUzNjYyNV0sWzAuMzU1MTQsNS42NjQ4MDIsLTAuNTcyODE0XSxbMi41MDg3MTEsNS41ODA5NzYsLTAuMjY2NjM2XSxbMi41NTYyMjYsMy42MzM3NzksLTEuNDI2MzYyXSxbMS44Nzg0NTYsNC41MzM3MTQsLTEuMjIzNzQ0XSxbMi40NjA3MDksNC40NDAyNDEsLTEuMTM5NV0sWzIuMjE4NTg5LDUuNTE0NjAzLC0wLjU2MDA2Nl0sWzIuMjYzNzEyLDUuNzM3MDIzLC0wLjI1MDY5NF0sWzIuOTY0OTgxLDMuODE0ODU4LC0xLjEzOTkyN10sWzAuOTkxMzg0LDUuMzA0MTMxLC0wLjk5OTg2N10sWzIuODExODcsNC41NDcyOTIsLTAuOTE2MDI1XSxbMi45MTgwODksNC43NjgzODIsLTAuNzAyODA4XSxbMy4yNjI0MDMsNC40MTQyODYsLTAuNjU3OTM1XSxbMC42NTIxMzYsNi4wODkxMTMsMC4wNjkwODldLFszLjM2MTM4OSwzLjUwNTIsLTAuOTQ2MTIzXSxbMi42MTMwNDIsNS4wMzcxOTIsLTAuNjk3MTUzXSxbMC4wOTQzMzksNC4zNjg1OCwtMS40NTEyMzhdLFszLjI5MDg2Miw0LjE1NTcxNiwtMC43MzIzMThdLFsyLjY1ODA2Myw0LjA3MzYxNCwtMS4yMTc0NTVdLFszLjI2MDM0OSwzLjc1MzI1NywtMC45NDY4MTldLFsxLjEyNDI2OCw0Ljg2MjQ2MywtMS4yMDc4NTVdLFszLjM1MTU4LDQuODk5MjQ3LC0wLjAyNzU4Nl0sWzMuMTk0MDU3LDQuNjkxMjU3LC0wLjUyNDU2Nl0sWzMuMDkwMTE5LDUuMTE2MDg1LC0wLjIzMjU1XSxbMi40MTg5NjUsMy44MTE3NTMsLTEuNDE5Mzk5XSxbMi4xOTE3ODksMy44NzcwMzgsLTEuNDcwMjNdLFs0LjA0MzE2NiwyLjAzNDE4OCwwLjAxNTQ3N10sWy0xLjAyNjk2NiwwLjg2NzY2LC0xLjQxMDkxMl0sWzEuOTM3NTYzLDMuODYwMDA1LC0xLjYxNzQ2NV0sWzIuOTg5MDQsNC4xMDE4MDYsLTAuOTk4MTMyXSxbLTAuMTQyNjExLDUuODY1MzA1LC0wLjEwMDg3Ml0sWzMuOTcyNjczLDIuMjkyMDY5LDAuMDg5NDYzXSxbMy4yMzM0OSwzLjk1OTkyNSwtMC44NDk4MjldLFswLjE2MzA0LDUuODU3Mjc2LC0wLjIxNjcwNF0sWzQuMTIyOTY0LDEuNzcwMDYxLC0wLjExNDkwNl0sWzIuMDk5MDU3LDQuOTc4Mzc0LC0wLjk4NDQ5XSxbMy41MDI0MTEsMy43NjE4MSwtMC42Njc1MDJdLFsyLjA3OTQ4NCw1LjkzOTYxNCwtMC4wMzYyMDVdLFstMC4wODQ1NjgsMy41MjUxOTMsLTIuMjUzNTA2XSxbMC40MjM4NTksNC4wNjA5NSwtMS44NDUzMjddLFsxLjYwMTMsNi4wMDY0NjYsLTAuMTUzNDI5XSxbMC4yNzE3MDEsMy44NDQ5NjQsLTIuMDc4NzQ4XSxbMC4yNzM1NzcsNS4yMTg5MDQsLTAuOTk0NzExXSxbLTAuNDEwNTc4LDMuOTIxNjUsLTEuNzczNjM1XSxbMS45NDE5NTQsNS42MDA0MSwtMC42MjE1NjldLFswLjEwMDgyNSw1LjQ2MjEzMSwtMC43NzQyNTZdLFstMC41MzAxNiwzLjYxOTg5MiwtMi4wMjc0NTFdLFstMC44MjIzNzEsNS41MTc0NTMsLTAuNjA1NzQ3XSxbLTIuNDc0OTI1LDcuNjcwODkyLC0wLjAyMDE3NF0sWzQuMDE1NzEsMC44MzAxOTQsLTAuMDEzNzkzXSxbLTAuNDAwMDkyLDUuMDk0MTEyLC0xLjA0MTk5Ml0sWy0yLjg4NzI4NCw1LjU4MTI0NiwtMC41MjUzMjRdLFstMS41NTk4NDEsNi4wNTA5NzIsMC4wNzkzMDFdLFstMC40NjkzMTcsMy4yOTE2NzMsLTIuMjM1MjExXSxbMC4zMzczOTcsMy40Njc5MjYsLTIuMjk1NDU4XSxbLTIuNjMyMDc0LDUuNTczNzAxLC0wLjU4MjcxN10sWy0wLjAzMDMxOCw2LjAxMTM5NSwwLjI3NjYxNl0sWy0wLjkzNDM3MywwLjM4ODk4NywtMS43ODA1MjNdLFstMi42NjEyNjMsNS44NDQ4MzgsLTAuNDI1OTY2XSxbMC41NDkzNTMsNS40ODk2NDYsLTAuODA3MjY4XSxbLTIuMTk0MzU1LDYuMTk3NDkxLC0wLjEwOTMyMl0sWy0yLjI4OTYxOCw1LjY2NDgxMywtMC41ODEwOThdLFsxLjU4MzU4MywzLjc5NjM2NiwtMS44NDQ0OThdLFswLjg1NTI5NSwwLjIxNTk3OSwtMS40MjU1NTddLFstMi42Mjc1NjksNS4zMDAyMzYsLTAuNzY3MTc0XSxbNC4zMzMzNDcsMi4zODQzMzIsMC4zOTkxMjldLFstMS44ODA0MDEsNS41ODM4NDMsLTAuNjk2NTYxXSxbLTIuMTcyMzQ2LDUuMzI0ODU5LC0wLjg0NjI0Nl0sWy0yLjI3MDU4LDUuOTA2MjY1LC0wLjM4ODM3M10sWy0xLjk2MDA0OSw1Ljg4OTM0NiwtMC4zOTc1OTNdLFswLjk2NTc1NiwzLjY3NTQ3LC0yLjEwNTY3MV0sWy0yLjAxNDA2Niw2LjQzMTEyNSwwLjI4NzI1NF0sWy0xLjc3NjE3Myw1LjI4NzA5NywtMC44OTA5MV0sWy0yLjAyNTg1Miw1LjA4OTU2MiwtMC45ODAyMThdLFstMS44ODY0MTgsNi4xMDgzNTgsLTAuMDAwNjY3XSxbLTEuNjAwODAzLDUuNzg1MzQ3LC0wLjQ5MTA2OV0sWy0xLjY2MTg4LDQuOTY4MDUzLC0xLjA0MjUzNV0sWy0xLjYwMDYyMSw1Ljk2MjgxOCwtMC4xODgwNDRdLFstMS41ODg4MzEsNS42MTU0MTgsLTAuNjY1NDU2XSxbNC40NjkwMSwxLjg4MDEzOCwwLjA1NzI0OF0sWy0xLjk3ODg0NSwwLjkyNzM5OSwtMC41NTQ4NTZdLFstMS40MDgwNzQsNS4zMjUyNjYsLTAuODM5NjddLFsxLjkyMzEyMyw0Ljg0Mzk1NSwtMS4xMDEzODldLFstMi44NzM3OCwwLjExNzEwNiwtMC40MTI3MzVdLFstMS4yMjIxOTMsNS42MjYzOCwtMC41Mzk5ODFdLFstMi42MzI1MzcsMC4xNjYzNDksLTAuNDg5MjE4XSxbLTEuMzcwODY1LDUuODM4ODMyLC0wLjM0MTAyNl0sWy0xLjA2Nzc0Miw1LjQ0ODg3NCwtMC42OTI3MDFdLFstMS4wNzM3OTgsNS4yMjA4NzgsLTAuOTA4Nzc5XSxbLTEuMTQ3NTYyLDQuOTUwNDE3LC0xLjA3OTcyN10sWy0yLjc4OTExNSw0LjUzMTA0NywtMS4wNDI3MTNdLFstMy41NTA4MjYsNC4xNzA0ODcsLTAuODA2MDU4XSxbLTMuMzMxNjk0LDQuNzk4MTc3LC0wLjY5NTY4XSxbLTMuNjg5NDA0LDQuNjg4NTQzLC0wLjUzNDMxN10sWy0zLjUxMTUwOSw1LjEwNjI0NiwtMC40ODM2MzJdLFsxLjc5NjM0NCwwLjA3NjEzNywwLjA4MDQ1NV0sWy0zLjMwNjM1NCw1LjQ3MzYwNSwtMC40Nzg3NjRdLFstMi42OTI1MDMsMy4zNDY2MDQsLTEuMjA5NTldLFstMy45NjMwNTYsNS4xODc0NjIsMy4xMTMxNTZdLFstMy45MDEyMzEsNi4zOTE0NzcsLTAuMjQ2OTg0XSxbNC40ODQyMzQsMS41MTg2MzgsLTAuMDAxNjE3XSxbNC4zMDg4MjksMS42NTc3MTYsLTAuMTE5Mjc1XSxbNC4yOTAwNDUsMS4zMzk1MjgsLTAuMTEwNjI2XSxbLTMuNTE0OTM4LDMuNTI0OTc0LC0wLjkwOTEwOV0sWy0yLjE5NDMsMi4xMjE2MywtMC43MTk2Nl0sWzQuMTA4MjA2LDEuMDkxMDg3LC0wLjExNDE2XSxbMy43ODUzMTIsMS4zOTI0MzUsLTAuMjg1ODhdLFs0LjA5Mjg4NiwxLjQ4MDQ3NiwtMC4yMTA2NTVdLFstMi45NjU5MzcsNi40NjkwMDYsLTAuMzc5MDg1XSxbLTMuNzA4NTgxLDIuOTYyOTc0LC0wLjYzOTc5XSxbLTMuMjk3OTcxLDIuMjE4OTE3LC0wLjI5OTg3Ml0sWzMuODA2OTQ5LDAuODA0NzAzLC0wLjExNDM4XSxbMy43NDc5NTcsMS4wNTkyNTgsLTAuMjczMDY5XSxbLTMuMTAxODI3LDQuMTExNDQ0LC0xLjAwNjI1NV0sWy0xLjUzNjQ0NSw0LjY1ODkxMywtMS4xOTUwNDldLFstMy41NDk4MjYsMi40NTA1NTUsLTAuMzc1Njk0XSxbLTMuNjc2NDk1LDIuMTA4MzY2LDAuNTM0MzIzXSxbLTMuNjc0NzM4LDUuOTI1MDc1LC0wLjQwMDAxMV0sWy0yLjI1MDExNSwyLjg0ODMzNSwtMS4xMjExNzRdLFstMy42OTgwNjIsNS42Njc1NjcsLTAuMzgxMzk2XSxbMy40Njg5NjYsMC43MzQ2NDMsLTAuMTkwNjI0XSxbLTMuOTc5NzIsNS42NzAwNzgsLTAuMjY4NzRdLFstMy4wMDIwODcsNC4zMzc4MzcsLTEuMDMzNDIxXSxbLTMuMzU2MzkyLDIuNjA4MzA4LC0wLjcxMzMyM10sWy0xLjgzMzAxNiwzLjM1OTk4MywtMS4yODc3NV0sWy0xLjk4OTA2OSwzLjYzMjQxNiwtMS4zMDU2MDddLFszLjU5MTI1NCwwLjU0MjM3MSwwLjAyNjE0Nl0sWzMuMzY0OTI3LDEuMDgyNTcyLC0wLjM0MjYxM10sWy0zLjM5Mzc1OSwzLjg2NjgwMSwtMC45MzcyNjZdLFstNC4xMjQ4NjUsNS41NDk1MjksLTAuMTYxNzI5XSxbLTQuNDIzNDIzLDUuNjg3MjIzLDAuMDAwMTAzXSxbLTEuNDk2ODgxLDIuNjAxNzg1LC0xLjExNDMyOF0sWy0yLjY0MjI5Nyw2LjQ5NjkzMiwtMC4yNjQxNzVdLFstMy42ODQyMzYsNi44MTk0MjMsLTAuMzIwMjMzXSxbLTIuMjg2OTk2LDMuMTY3MDY3LC0xLjI0NjY1MV0sWy0xLjYyNDg5Niw4LjQ0ODQ4LC0wLjUzMDAxNF0sWy0zLjY2Njc4NywyLjE1OTI2NiwwLjI2ODE0OV0sWy0yLjQwMjYyNSwyLjAxMTI0MywtMC41NjQ0Nl0sWy0yLjczNjE2NiwyLjI1OTgzOSwtMC42OTQzXSxbLTIuMTY4NjExLDMuODkwNzgsLTEuMjkyMjA2XSxbLTIuMDY1OTU2LDMuMzQ1NzA4LC0xLjI4MTM0Nl0sWy0yLjc3ODE0NywyLjY3NTYwNSwtMC45OTU3MDZdLFstMy41MDc0MzEsNC41MTMyNzIsLTAuNzE4MjldLFstMi4zMDExODQsNC4yOTM5MTEsLTEuMjM4MTgyXSxbMy4yMDU4MDgsMC4yMTEwNzgsMC4zOTQzNDldLFstMi4xMjk5MzYsNC44NzA1NzcsLTEuMDgwNzgxXSxbLTIuMjg3OTc3LDIuNDk2NTkzLC0wLjkzNDA2OV0sWy0yLjcwMTgzMywyLjkzMTgxNCwtMS4xMTQ1MDldLFszLjI5NDc5NSwwLjUwNjMxLC0wLjA4MTA2Ml0sWy0yLjU1MjgyOSw3LjQ2ODc3MSwtMC4wMjE1NDFdLFszLjA2NzIxLDAuOTQ0MDY2LC0wLjQzMDc0XSxbLTIuODYwODYsMS45NzM2MjIsLTAuMzAzMTMyXSxbLTMuNTk4ODE4LDUuNDE5NjEzLC0wLjQwMTY0NV0sWy0xLjUyNDM4MSwwLjA4MDE1NiwtMS42MTY2Ml0sWy0xLjkwNzI5MSwyLjY0NjI3NCwtMS4wMzk0MzhdLFsyLjk1MDc4MywwLjQwNzU2MiwtMC4xMDU0MDddLFstMS42NjMwNDgsMS42NTUwMzgsLTAuNjg5Nzg3XSxbLTEuNzI4MTAyLDEuMTEwMDY0LC0wLjYzNTk2M10sWy0yLjA4NTgyMyw3LjY4NjI5NiwtMC4xNTk3NDVdLFsyLjg4MzUxOCwzLjE1NzAwOSwtMS4zMDg1OF0sWy0yLjcyNDExNiwwLjQxNzE2OSwtMC4zODk3MTldLFstMS43ODg2MzYsNy44NjI2NzIsLTAuMzQ2NDEzXSxbLTIuMTg2NDE4LDEuMjQ5NjA5LC0wLjQzNDU4M10sWy0zLjA5MjQzNCwyLjYwNjY1NywtMC44NjAwMDJdLFstMS43MzczMTQsMy44NzQyMDEsLTEuMzMwOTg2XSxbMi41NjQ1MjIsMC40MjI5NjcsLTAuMzkwOTAzXSxbMS42NzA3ODIsMy41Mzg0MzIsLTEuOTI0NzUzXSxbLTIuMzM4MTMxLDQuMDI1NzgsLTEuMjg2NjczXSxbLTEuOTE2NTE2LDQuMDU0MTIxLC0xLjMwMTc4OF0sWzIuODcxNTksMi4wMzQ5NDksLTEuMjY3MTM5XSxbLTEuOTMxNTE4LDMuMDYyODgzLC0xLjE5NzIyN10sWy0wLjgxNjYwMiwwLjEzNTY4MiwzLjEwNDEwNF0sWzAuNDY5MzkyLDAuMjEzOTE2LC0xLjQ4OTYwOF0sWzIuNTc0MDU1LDEuOTUwMDkxLC0xLjUxNDQyN10sWzIuNzMzNTk1LDIuNjgyNTQ2LC0xLjQ2MTIxM10sWy0xLjkxNTQwNyw0LjY5MzY0NywtMS4xNTE3MjFdLFstMy40MTI4ODMsNS44NjcwOTQsLTAuNDUwNTI4XSxbMi4yODgyMiwwLjEyMDQzMiwtMC4wNDEwMl0sWzIuMjQ0NDc3LDAuMTQ0MjQsLTAuMzc2OTMzXSxbLTEuNjc2MTk4LDMuNTcwNjk4LC0xLjMyODAzMV0sWy0xLjgyMTE5Myw0LjM2Njk4MiwtMS4yNjYyNzFdLFstMS41NTIyMDgsOC4wOTkyMjEsLTAuNTMyNjJdLFstMS43Mjc0MTksMi4zOTA5NywtMC45ODk0NTZdLFstMi40NjgyMjYsNC43MTE2NjMsLTEuMDY5NzY2XSxbLTIuNDUxNjY5LDYuMTEzMzE5LC0wLjI3Mzc4OF0sWzIuNjM1NDQ3LDIuMjk1ODQyLC0xLjUxODM2MV0sWy0yLjAyMDgwOSw4LjE1MDI1MywtMC4yNDY3MTRdLFsyLjI5MjQ1NSwwLjgwNTU5NiwtMS4zMDQyXSxbMi42NDE1NTYsMS42NTY2NSwtMS40NjY5NjJdLFsyLjQwOTA2MiwyLjg0MjUzOCwtMS42MzUwMjVdLFsyLjQ1NjY4MiwxLjQ1OTQ4NCwtMS41NzU0M10sWy0xLjY5MTA0NywzLjE3MzU4MiwtMS4yNDcwODJdLFstMS44NjU2NDIsMS45NTc2MDgsLTAuNzY4NjgzXSxbLTMuNDAxNTc5LDAuMjA0MDcsMC4xMDA5MzJdLFsyLjMwMTk4MSwxLjcxMDIsLTEuNjUwNDYxXSxbMi4zNDI5MjksMi42MTE5NDQsLTEuNjkwNzEzXSxbLTEuNjc2MTExLDIuOTIzODk0LC0xLjE3ODM1XSxbLTIuOTkyMDM5LDMuNTQ3NjMxLC0xLjExODk0NV0sWy0zLjU3MTY3Nyw2LjUwNDYzNCwtMC4zNzU0NTVdLFsyLjE0MTc2NCwxLjQ2MDg2OSwtMS43MDI0NjRdLFstMy4yMjE5NTgsNS4xNDYwNDksLTAuNjE1NjMyXSxbMi4xOTIzOCwyLjk0OTM2NywtMS43NDcyNDJdLFsyLjMyMDc5MSwyLjIzMjk3MSwtMS43MDY4NDJdLFsyLjA4ODY3OCwyLjU4NTIzNSwtMS44MTMxNTldLFstMi4xOTY0MDQsMC41OTIyMTgsLTAuNTY5NzA5XSxbLTIuMTIwODExLDEuODM2NDgzLC0wLjYyMzM4XSxbLTEuOTQ5OTM1LDIuMjcxMjQ5LC0wLjg3NDEyOF0sWzIuMjM1OTAxLDEuMTEwMTgzLC0xLjUxMDcxOV0sWzIuMDIwMTU3LDMuMjQxMTI4LC0xLjgwMzkxN10sWzIuMDU0MzM2LDEuOTQ5Mzk0LC0xLjc5MjMzMl0sWy0zLjA5NDExNyw0Ljk5NjU5NSwtMC43NDAyMzhdLFsyLjAzODA2MywwLjYzNTk0OSwtMS40MDIwNDFdLFsxLjk4MDY0NCwxLjY4NDQwOCwtMS43Njc3OF0sWzEuNTg3NDMyLDMuMzA2NTQyLC0xLjk5MTEzMV0sWzEuOTM1MzIyLDAuOTc2MjY3LC0xLjYwMjIwOF0sWzEuOTIyNjIxLDEuMjM1NTIyLC0xLjY5ODgxM10sWzEuNzEyNDk1LDEuOTExODc0LC0xLjkwMzIzNF0sWzEuOTEyODAyLDIuMjU5MjczLC0xLjg4ODY5OF0sWzEuODg0MzY3LDAuMzU1NDUzLC0xLjMxMjYzM10sWzEuNjc2NDI3LDAuNzYyODMsLTEuNTM5NDU1XSxbMS43ODQ1MywyLjgzNjYyLC0xLjk0MzAzNV0sWzEuNjk3MzEyLDAuMTIwMjgxLC0xLjE1MDMyNF0sWzEuNjQ4MzE4LDIuNDg0OTczLC0xLjk5OTUwNV0sWy00LjA1MTgwNCw1Ljk1ODQ3MiwtMC4yMzE3MzFdLFstMS45NjQ4MjMsMS40NjQ2MDcsLTAuNTgxMTVdLFsxLjU1OTk2LDIuMTgzNDg2LC0xLjk3MTM3OF0sWzEuNjI4MTI1LDEuMDQ1OTEyLC0xLjcwNzgzMl0sWzEuNzAxNjg0LDEuNTQwNDI4LC0xLjgyNzE1Nl0sWzEuNTY3NDc1LDQuODY5NDgxLC0xLjE4NDY2NV0sWzEuNDMyNDkyLDAuODQzNzc5LC0xLjY0ODA4M10sWzEuMTczODM3LDIuOTc4OTgzLC0yLjE1NjY4N10sWzEuMjM1Mjg3LDMuMzc5NzUsLTIuMDk1MTVdLFsxLjI1MjU4OSwxLjUyNTI5MywtMS45NDkyMDVdLFsxLjE1OTMzNCwyLjMzNjM3OSwtMi4xMDUzNjFdLFsxLjQ5MDYxLDIuNjk1MjYzLC0yLjA4MzIxNl0sWy00LjEyMjQ4Niw2Ljc4MjYwNCwtMC4wMjU0NV0sWzEuMTczMzg4LDAuMjc5MTkzLC0xLjQyMzQxOF0sWzEuNTA1Njg0LDAuMzgwODE1LC0xLjQxNDM5NV0sWzEuMzkxNDIzLDEuMzQzMDMxLC0xLjg0MzU1N10sWzEuMjYzNDQ5LDIuNzMyMjUsLTIuMTQ0OTYxXSxbMS4yOTU4NTgsMC41OTcxMjIsLTEuNTE1NjI4XSxbMS4yNDU4NTEsMy43MjkxMjYsLTEuOTkzMDE1XSxbLTIuNzYxNDM5LDYuMjM3MTcsLTAuMzY1ODU2XSxbMC45Nzg4ODcsMS42NjQ4ODgsLTIuMDQ2NjMzXSxbMS4yMTk1NDIsMC45ODI3MjksLTEuNzg1NDg2XSxbMS4zMTU5MTUsMS45MTc0OCwtMi4wMjc4OF0sWy0zLjA1Mjc0NiwyLjEyNzIyMiwtMC4zNjkwODJdLFswLjk3NzY1NiwxLjM2MjIzLC0xLjk0NDExOV0sWzAuOTM2MTIyLDMuMzk0NDcsLTIuMjAzMDA3XSxbLTIuNzQwMDM2LDQuMTg0NzAyLC0xLjEyMjg0OV0sWzAuODUzNTgxLDIuODY0Njk0LC0yLjI2MDg0N10sWzAuNzE5NTY5LDAuODE4NzYyLC0xLjc2MzYxOF0sWzAuODM5MTE1LDEuMTU5MzU5LC0xLjkwNzk0M10sWzAuOTMyMDY5LDEuOTQ1NTksLTIuMTE3OTYyXSxbMC41NzkzMjEsMy4zMjY3NDcsLTIuMjk5MzY5XSxbMC44NjMyNCwwLjU5NzgyMiwtMS41NjUxMDZdLFswLjU3NDU2NywxLjE1ODQ1MiwtMS45NDMxMjNdLFswLjUyNTEzOCwyLjEzNzI1MiwtMi4yMTM4NjddLFswLjc3OTk0MSwyLjM0MjAxOSwtMi4yMDYxNTddLFswLjkxNTI1NSwyLjYxODEwMiwtMi4yMDkwNDFdLFswLjUyNjQyNiwzLjAyMjQxLC0yLjMyMTgyNl0sWzAuNDk1NDMxLDIuNTIxMzk2LC0yLjI5NTkwNV0sWzAuODA3OTksMy4xNTY4MTcsLTIuMjg2NDMyXSxbMC4yNzM1NTYsMS4zMDQ5MzYsLTIuMDEyNTA5XSxbMC42NjQzMjYsMS41MzAwMjQsLTIuMDQ4NzIyXSxbMC4yMTkxNzMsMi4zMjkwNywtMi4zMjMyMTJdLFswLjQwNTMyNCwwLjY5NTM1OSwtMS43MDQ4ODRdLFswLjM5ODgyNywwLjk0NjY0OSwtMS44NDM4OTldLFswLjM0NTEwOSwxLjYwODgyOSwtMi4xMDAxNzRdLFstMi4zNTY3NDMsMC4wNjIwMzIsLTAuNDk0N10sWy0zLjAwMTA4NCwwLjI3MTQ2LDIuNTYwMDM0XSxbLTIuMDY0NjYzLDAuMzAzMDU1LC0wLjY5NzMyNF0sWzAuMjIxMjcxLDMuMTc0MDIzLC0yLjM3NDM5OV0sWzAuMTk1ODQyLDAuNDM3ODY1LC0xLjYyMTQ3M10sWy0wLjM4NTYxMywwLjI5Nzc2MywxLjk2MDA5Nl0sWzEuOTk5NjA5LDAuMTA4OTI4LC0wLjc5MTI1XSxbMC4zNTE2OTgsOS4yMjc0OTQsLTEuNTc1NjVdLFswLjAyMTQ3NywyLjE5MTkxMywtMi4zMDkzNTNdLFswLjI0NjM4MSwyLjgzNjU3NSwtMi4zNTYzNjVdLFsxLjU0MzI4MSwwLjIzNzUzOSwxLjkwMTkwNl0sWzAuMDMxODgxLDkuMTQ3MDIyLC0xLjQ1NDIwM10sWy0wLjAwMTg4MSwxLjY0ODUwMywtMi4xMDgwNDRdLFswLjMzMzQyMywxLjkwNzA4OCwtMi4yMDQ1MzNdLFswLjA0NDA2MywyLjYzNDAzMiwtMi4zNjg0MTJdLFstMC4wMjgxNDgsMy4wNTM2ODQsLTIuMzkwMDgyXSxbMC4wMjQxMywzLjM0Mjk3LC0yLjM2NTQ0XSxbLTAuMjcyNjQ1LDkuMDI4NzksLTEuMjM4Njg1XSxbLTAuMDA2MzQ4LDAuODMyMDQ0LC0xLjc1ODIyMl0sWy0wLjMyMTEwNSwxLjQ1ODc1NCwtMS44ODYzMTNdLFstMC4xNTM5NDgsOC42MTg4MDksLTEuMTA1MzUzXSxbLTAuNDA5MzAzLDEuMTM3NzgzLC0xLjcyMDU1Nl0sWy0wLjQxMDA1NCwxLjc0Mjc4OSwtMS45NTc5ODldLFstMC4yODc5MDUsMi4zODA0MDQsLTIuMjk0NTA5XSxbLTAuMjYxMzc1LDIuNjQ2NjI5LC0yLjM1NjMyMl0sWy0wLjIyMTk4NiwzLjIxNTMwMywtMi4zNDU4NDRdLFstMC4zMTYwOCwwLjY4NzU4MSwtMS43MTkwMV0sWy0wLjUzNzcwNSwwLjg1NTgwMiwtMS42NDg1ODVdLFstMC4xNDI4MzQsMS4xOTMwNTMsLTEuODczNzFdLFstMC4yNDM3MSwyLjA0NDQzNSwtMi4xNzY5NThdLFstMC40Mzc5OTksMi45NTk3NDgsLTIuMjk5Njk4XSxbLTAuNzg4OTUsMC4xNzYyMjYsLTEuNzI5MDQ2XSxbLTAuNjA4NTA5LDAuNTQ2OTMyLC0xLjczNDAzMl0sWy0wLjY5MzY5OCw0LjQ3ODc4MiwtMS4zNjkzNzJdLFstMC42NjkxNTMsOC40Njk2NDUsLTAuOTExMTQ5XSxbLTAuNzQxODU3LDEuMDgyNzA1LC0xLjQ1ODQ3NF0sWy0wLjU1NDA1OSwyLjQ0MDMyNSwtMi4xNDE3ODVdLFsyLjA5MjYxLDAuMTUzMTgyLDIuNTc1ODFdLFsxLjc5MjU0NywwLjExMTc5NCwyLjU2Mzc3N10sWzEuODU1Nzg3LDAuMTg5NTQxLDIuODM1MDg5XSxbMS40OTI2MDEsMC4yMzIyNDYsMi45ODc2ODFdLFstMC4yODQ5MTgsMC4yMzY2ODcsMy40Mjk3MzhdLFsyLjYwNDg0MSwwLjExOTk3LDEuMDE1MDZdLFswLjMzMTI3MSwwLjE2ODExMywzLjEyNDAzMV0sWzAuMjgwNjA2LDAuMzA4MzY4LDIuNDk1OTM3XSxbMC41NDQ1OTEsMC4zMjU3MTEsMi4wODEyNzRdLFswLjE5MzE0NSwwLjE5MTU0LC0wLjk3NzU1Nl0sWzMuODEwMDk5LDAuNDIzMjQsMS4wMzIyMDJdLFszLjU0NjIyLDAuMzc5MjQ1LDEuMzkyODE0XSxbMC42MTQwMiwwLjI3NjMyOCwwLjg0OTM1Nl0sWy0xLjE5ODYyOCwwLjE0NDk1MywyLjkxMTQ1N10sWzQuMTcxOTksMC42ODAzNywxLjM5MTUyNl0sWzAuODgyNzksMC4zMjEzMzksMi4wNTkxMjldLFsxLjkzMDM1LDAuMTA5OTkyLDIuMDU0MTU0XSxbMS42MjAzMzEsMC4xMjE5ODYsMi4zNzIwM10sWzIuMzc0ODEyLDAuMTA5MjEsMS43MzQ4NzZdLFstMC4wMzEyMjcsMC4yOTQ0MTIsMi41OTM2ODddLFs0LjA3NTAxOCwwLjU2MTkxNCwxLjAzODA2NV0sWy0wLjU3MDM2NiwwLjEyNjU4MywyLjk3NTU1OF0sWzAuOTUwMDUyLDAuMzE4NDYzLDEuODA0MDEyXSxbMS4xMzAwMzQsMC4xMTcxMjUsMC45ODM4NV0sWzIuMTIzMDQ5LDAuMDg5NDYsMS42NjU5MTFdLFsyLjA4NzU3MiwwLjA2ODYyMSwwLjMzNTAxM10sWzIuOTI3MzM3LDAuMTY3MTE3LDAuMjg5NjExXSxbMC41Mjg4NzYsMC4zMTM0MzQsMy4yMDU5NjldLFsxLjE3NDkxMSwwLjE2Mjc0NCwxLjMyODI2Ml0sWy00Ljg4ODQ0LDUuNTk1MzUsMS42NjExMzRdLFstNC43MDk2MDcsNS4xNjUzMzgsMS4zMjQwODJdLFswLjg3MTE5OSwwLjI3NzAyMSwxLjI2MzgzMV0sWy0zLjkxMDg3NywyLjM0OTMxOCwxLjI3MjI2OV0sWzEuNTY4MjQsMC4xMTg2MDUsMi43NjgxMTJdLFsxLjE3OTE3NiwwLjE1MjYxNywtMC44NTgwMDNdLFsxLjYzNDYyOSwwLjI0Nzg3MiwyLjEyODYyNV0sWy00LjYyNzQyNSw1LjEyNjkzNSwxLjYxNzgzNl0sWzMuODQ1NTQyLDAuNTQ5MDcsMS40NTYwMV0sWzIuNjU0MDA2LDAuMTY1NTA4LDEuNjM3MTY5XSxbLTAuNjc4MzI0LDAuMjY0ODgsMS45NzQ3NDFdLFsyLjQ1MTEzOSwwLjEwMDM3NywwLjIxMzc2OF0sWzAuNjMzMTk5LDAuMjg2NzE5LDAuNDAzMzU3XSxbLTAuNTMzMDQyLDAuMjUyNCwxLjM3MzI2N10sWzAuOTkzMTcsMC4xNzExMDYsMC42MjQ5NjZdLFstMC4xMDAwNjMsMC4zMDY0NjYsMi4xNzAyMjVdLFsxLjI0NTk0MywwLjA5MjM1MSwwLjY2MTAzMV0sWzEuMzkwNDE0LDAuMTk4OTk2LC0wLjA4NjRdLFstNC40NTcyNjUsNS4wMzA1MzEsMi4xMzgyNDJdLFsyLjg5Nzc2LDAuMTQ2NTc1LDEuMjk3NDY4XSxbMS44MDI3MDMsMC4wODg4MjQsLTAuNDkwNDA1XSxbMS4wNTU0NDcsMC4zMDkyNjEsMi4zOTI0MzddLFsyLjMwMDQzNiwwLjE0MjQyOSwyLjEwNDI1NF0sWzIuMzMzOTksMC4xODc3NTYsMi40MTY5MzVdLFsyLjMyNTE4MywwLjEzNDM0OSwwLjU3NDA2M10sWzIuNDEwOTI0LDAuMzcwOTcxLDIuNjM3MTE1XSxbMS4xMzI5MjQsMC4yOTA1MTEsMy4wNjFdLFsxLjc2NDAyOCwwLjA3MDIxMiwtMC44MDUzNV0sWzIuMTU2OTk0LDAuMzk3NjU3LDIuODQ0MDYxXSxbMC45MjA3MTEsMC4yMjU1MjcsLTAuODgyNDU2XSxbLTQuNTUyMTM1LDUuMjQwOTYsMi44NTUxNF0sWzAuMjEwMDE2LDAuMzA5Mzk2LDIuMDY0Mjk2XSxbMC42MTIwNjcsMC4xMzY4MTUsLTEuMDg2MDAyXSxbMy4xNTAyMzYsMC40MjY3NTcsMS44MDI3MDNdLFstMC4yNDgyNCwwLjI4MjI1OCwxLjQ3MDk5N10sWzAuOTc0MjY5LDAuMzAxMzExLC0wLjY0MDg5OF0sWy00LjQwMTQxMyw1LjAzOTY2LDIuNTM1NTUzXSxbMC42NDQzMTksMC4yNzQwMDYsLTAuODE3ODA2XSxbMC4zMzI5MjIsMC4zMDkwNzcsMC4xMDg0NzRdLFszLjYxMDAwMSwwLjMxNzQ0NywwLjY4OTM1M10sWzMuMzM1NjgxLDAuMzU4MTk1LDAuMTE4NDc3XSxbMC42MjM1NDQsMC4zMTg5ODMsLTAuNDE5M10sWy0wLjExMDEyLDAuMzA3NzQ3LDEuODMxMzMxXSxbLTAuNDA3NTI4LDAuMjkxMDQ0LDIuMjgyOTM1XSxbMC4wNjk3ODMsMC4yODUwOTUsMC45NTAyODldLFswLjk3MDEzNSwwLjMxMDM5MiwtMC4yODM3NDJdLFswLjg0MDU2NCwwLjMwNjg5OCwwLjA5ODg1NF0sWy0wLjU0MTgyNywwLjI2Nzc1MywxLjY4Mzc5NV0sWy0zLjk1NjA4Miw0LjU1NzEzLDIuMjk3MTY0XSxbLTQuMTYxMDM2LDIuODM0NDgxLDEuNjQxODNdLFstNC4wOTM5NTIsNC45Nzc1NTEsMi43NDc3NDddLFsyLjY2MTgxOSwwLjI2MTg2NywxLjkyNjE0NV0sWy0zLjc0OTkyNiwyLjE2MTg3NSwwLjg5NTIzOF0sWy0yLjQ5Nzc3NiwxLjM2MjksMC43OTE4NTVdLFswLjY5MTQ4MiwwLjMwNDk2OCwxLjU4MjkzOV0sWy00LjAxMzE5Myw0LjgzMDk2MywyLjQ3NjldLFstMy42Mzk1ODUsMi4wOTEyNjUsMS4zMDQ0MTVdLFstMy45NzY3LDIuNTYzMDUzLDEuNjI4NF0sWy0zLjk3OTkxNSwyLjc4ODYxNiwxLjk3Nzk3N10sWzAuMzg4NzgyLDAuMzEyNjU2LDEuNzA5MTY4XSxbLTMuNDA4NzMsMS44NzczMjQsMC44NTE2NTJdLFstMy42NzE2MzcsNS4xMzY5NzQsMy4xNzA3MzRdLFstMy4xMjk2NCwxLjg1MjAxMiwwLjE1NzY4Ml0sWy0zLjYyOTY4Nyw0Ljg1MjY5OCwyLjY4NjgzN10sWy0zLjE5NjE2NCwxLjc5MzQ1OSwwLjQ1MjgwNF0sWy0zLjc0NjMzOCwyLjMxMzU3LDEuNjQ4NTUxXSxbMi45OTIxOTIsMC4xMjUyNTEsMC41NzU5NzZdLFstMy4yNTQwNTEsMC4wNTQ0MzEsMC4zMTQxNTJdLFstMy40NzQ2NDQsMS45MjUyODgsMS4xMzQxMTZdLFstMy40MTgzNzIsMi4wMjI4ODIsMS41Nzg5MDFdLFstMi45MjA5NTUsMS43MDU0MDMsMC4yOTg0Ml0sWy0zLjU3MjI5LDIuMTUyMDIyLDEuNjA3NTcyXSxbLTMuMjUxMjU5LDAuMDkwMTMsLTAuMTA2MTc0XSxbLTMuMjk5OTUyLDEuODc3NzgxLDEuMzQ4NjIzXSxbLTMuNjY2ODE5LDIuNDQxNDU5LDIuMDA0ODM4XSxbLTIuOTEyNjQ2LDEuODI0NzQ4LC0wLjA0NTM0OF0sWy0zLjM5OTUxMSwyLjQ3OTQ4NCwyLjM0MDM5M10sWy0zLjAwOTc1NCwwLjAxNTI4NiwwLjA3NTU2N10sWy0zLjM4MTQ0MywyLjMxNjkzNywyLjE1NjkyM10sWy0zLjM1MjgwMSwyLjEzMzM0MSwxLjg1NzM2Nl0sWy0zLjAxNzg4LDEuNjg3Njg1LDAuNjQ1ODY3XSxbLTIuOTMxODU3LDEuNjc4NzEyLDEuMTU4NDcyXSxbLTMuMzAxMDA4LDAuMDg4MzYsMC41OTEwMDFdLFsxLjM1ODAyNSwwLjE5Nzk1LDEuNTk5MTQ0XSxbLTIuOTk5NTY1LDEuODQ1MDE2LDEuNjE4Mzk2XSxbLTIuNzY3OTU3LDAuMDI4Mzk3LC0wLjE5NjQzNl0sWy0yLjkzOTYyLDIuMDc4Nzc5LDIuMTQwNTkzXSxbLTMuMzQ2NjQ4LDIuNjc0MDU2LDIuNTE4MDk3XSxbMy4zMjQzMjIsMC4yMDgyMiwwLjYyODYwNV0sWzMuMDkxNjc3LDAuMTM3MjAyLDAuOTM0NV0sWy0yLjg4MTgwNywwLjAwOTk1MiwwLjMxODQzOV0sWy0yLjc2NDk0NiwxLjc4NjYxOSwxLjY5MzQzOV0sWy0yLjkwNTU0MiwxLjkzMjM0MywxLjkwMDAwMl0sWy0zLjE0MDg1NCwyLjI3MTM4NCwyLjI3NDk0Nl0sWy0yLjg4OTk1LDIuNDg3ODU2LDIuNTc0NzU5XSxbLTIuMzY3MTk0LC0wLjAwMDk0MywtMC4xNTU3Nl0sWy0zLjA1MDczOCwwLjA2ODcwMywwLjc0Mjk4OF0sWy0yLjc1OTUyNSwxLjU1Njc5LDAuODc3NzgyXSxbLTMuMTUxNzc1LDIuNDgwNTQsMi40ODI3NDldLFstMi41Nzg2MTgsLTAuMDAyODg1LDAuMTY1NzE2XSxbLTIuNjUxNjE4LDEuODc3MjQ2LDEuOTgxMTg5XSxbLTIuOTMzOTczLDAuMTMzNzMxLDEuNjMxMDIzXSxbMS4wNDc2MjgsMC4xMDAyODQsLTEuMDg1MjQ4XSxbLTEuNTg1MTIzLDAuMDYyMDgzLC0xLjM5NDg5Nl0sWy0yLjI4NzkxNywtMC4wMDI2NzEsMC4yMTQ0MzRdLFstMi41MjQ4OTksMC4wMDc0ODEsMC40NzE3ODhdLFstMi44MTU0OTIsMi4xODgxOTgsMi4zNDMyOTRdLFstMi4wOTUxNDIsLTAuMDAzMTQ5LC0wLjA5NDU3NF0sWy0yLjE3MjY4NiwtMC4wMDAxMzMsMC40Nzk2M10sWy0yLjczMjcwNCwwLjA3NDMwNiwxLjc0MjA3OV0sWy0yLjQ5NjUzLDIuMTQ1NjY4LDIuNDI2OTFdLFstMS4zNDM2ODMsMC4wNDc3MjEsLTEuNTA2MzkxXSxbLTIuNTgxMTg1LDAuMDQ4NzAzLDAuOTc1NTI4XSxbLTIuOTA1MTAxLDAuMDgzMTU4LDIuMDEwMDUyXSxbLTIuNjAxNTE0LDIuMDA3ODAxLDIuMjIzMDg5XSxbLTIuMzM5NDY0LDAuMDI2MzQsMS40ODQzMDRdLFstMi45MDc4NzMsMC4xMDM2NywyLjM3ODE0OV0sWy0xLjM2ODc5NiwwLjA2MjUxNiwtMS4wNDkxMjVdLFstMS45MzI0NCwwLjAyNDQzLC0wLjQyNzYwM10sWy0yLjcwNTA4MSwwLjA2MDUxMywyLjMwMzgwMl0sWzMuMzcyMTU1LDAuMjA2Mjc0LDAuODkyMjkzXSxbLTEuNzYxODI3LDAuMDkzMjAyLC0xLjAzNzQwNF0sWy0xLjcwMDY2NywwLjAzOTcsLTAuNjE0MjIxXSxbLTEuODcyMjkxLDAuMDExOTc5LC0wLjEzNTc1M10sWy0xLjkyOTI1NywwLjA3NDAwNSwwLjcyODk5OV0sWy0yLjUyMDEyOCwwLjA0OTY2NSwxLjk5MDU0XSxbLTIuNjk5NDExLDAuMTAwOTIsMi42MDMxMTZdLFszLjIxMTcwMSwwLjI3MzAyLDEuNDIzMzU3XSxbLTEuNDQ1MzYyLDAuMTM3MSwtMC42MjY0OTFdLFsyLjkyMTMzMiwwLjI1OTExMiwxLjY0NTUyNV0sWy0wLjk5MzI0MiwwLjA1ODY4NiwtMS40MDg5MTZdLFstMC45NDQ5ODYsMC4xNTc1NDEsLTEuMDk3NjY1XSxbLTIuMTU0MzAxLDAuMDMyNzQ5LDEuODgyMDAxXSxbLTIuMTA4Nzg5LDEuOTg4NTU3LDIuNDQyNjczXSxbLTEuMDE1NjU5LDAuMjU0OTcsLTAuNDE2NjY1XSxbLTEuODk4NDExLDAuMDE1ODcyLDAuMTY3MTVdLFstMS41ODU1MTcsMC4wMjcxMjEsMC40NTM0NDVdLFstMi4zMTExMDUsMC4wNjEyNjQsMi4zMjcwNjFdLFstMi42MzcwNDIsMC4xNTIyMjQsMi44MzIyMDFdLFstMi4wODc1MTUsMi4yOTI5NzIsMi42MTc1ODVdLFstMC43NTA2MTEsMC4wNTY2OTcsLTEuNTA0NTE2XSxbLTAuNDcyMDI5LDAuMDc1NjU0LC0xLjM2MDIwM10sWy0wLjcxMDc5OCwwLjEzOTI0NCwtMS4xODM4NjNdLFstMC45Nzc1NSwwLjI2MDUyLC0wLjgzMTE2N10sWy0wLjY1NTgxNCwwLjI2MDg0MywtMC44ODAwNjhdLFstMC44OTc1MTMsMC4yNzU1MzcsLTAuMTMzMDQyXSxbLTIuMDQ5MTk0LDAuMDg0OTQ3LDIuNDU1NDIyXSxbLTAuMTc3ODM3LDAuMDc2MzYyLC0xLjQ0OTAwOV0sWy0wLjU1MzM5MywwLjI3OTA4MywtMC41OTU3M10sWy0xLjc4ODYzNiwwLjA2MTYzLDIuMjMxMTk4XSxbLTAuMzQ3NjEsMC4yNTU1NzgsLTAuOTk5NjE0XSxbLTEuMzk4NTg5LDAuMDM2NDgyLDAuNjU4NzFdLFstMS4xMzM5MTgsMC4wNTYxNywwLjY5NDczXSxbLTEuNDMzNjksMC4wNTgyMjYsMS45Nzc4NjVdLFstMi41MDU0NTksMS40OTIyNjYsMS4xOTI5NV1dXG5leHBvcnRzLmNlbGxzPVtbMiwxNjYxLDNdLFsxNjc2LDcsNl0sWzcxMiwxNjk0LDldLFszLDE2NzQsMTY2Ml0sWzExLDE2NzIsMF0sWzE3MDUsMCwxXSxbNSw2LDE2NzRdLFs0LDUsMTY3NF0sWzcsOCw3MTJdLFsyLDE2NjIsMTBdLFsxLDEwLDE3MDVdLFsxMSwxNjkwLDE2NzJdLFsxNzA1LDExLDBdLFs1LDE2NzYsNl0sWzcsOSw2XSxbNyw3MTIsOV0sWzIsMywxNjYyXSxbMyw0LDE2NzRdLFsxLDIsMTBdLFsxMiw4MiwxODM3XSxbMTgwOCwxMiwxNzk5XSxbMTgwOCwxNzk5LDE3OTZdLFsxMiw4NjEsODJdLFs4NjEsMTgwOCwxM10sWzE4MDgsODYxLDEyXSxbMTc5OSwxMiwxODE2XSxbMTY4MCwxNCwxNDQ0XSxbMTUsMTcsMTZdLFsxNCwxNjc4LDE3MDBdLFsxNiwxNywxNjc5XSxbMTUsMTY2MCwxN10sWzE0LDEwODQsMTY3OF0sWzE1LDE3MDgsMThdLFsxNSwxOCwxNjYwXSxbMTY4MCwxMDg0LDE0XSxbMTY4MCwxNSwxMDg0XSxbMTUsMTY4MCwxNzA4XSxbNzkzLDgxMywxMTldLFsxMDc2LDc5MywxMTldLFsxMDc2LDE4MzYsMjJdLFsyMywxOSwyMF0sWzIxLDEwNzYsMjJdLFsyMSwyMiwyM10sWzIzLDIwLDIxXSxbMTA3NiwxMTksMTgzNl0sWzgwNiw2MzQsNDcwXSxbNDMyLDEzNDksODA2XSxbMjUxLDQyLDEyNV0sWzgwOSwxMTcxLDc5MV0sWzk1Myw2MzEsODI3XSxbNjM0LDEyMTAsMTE3Nl0sWzE1NywxODMyLDE4MzRdLFs1NiwyMTksNTNdLFsxMjYsMzgsODNdLFszNyw4NSw0M10sWzU5LDExNTEsMTE1NF0sWzgzLDc1LDQxXSxbNzcsODUsMTM4XSxbMjAxLDk0OCw0Nl0sWzEzNjIsMzYsMzddLFs0NTIsNzc1LDg4NV0sWzEyMzcsOTUsMTA0XSxbOTY2LDk2MywxMjYyXSxbODUsNzcsNDNdLFszNiw4NSwzN10sWzEwMTgsNDM5LDEwMTldLFs0MSwyMjUsNDgxXSxbODUsODMsMTI3XSxbOTMsODMsNDFdLFs5MzUsOTcyLDk2Ml0sWzExNiw5MywxMDBdLFs5OCw4Miw4MTNdLFs0MSw3NSwyMjVdLFsyOTgsNzUxLDU0XSxbMTAyMSw0MTUsMTAxOF0sWzc3LDEzOCwxMjhdLFs3NjYsODIzLDEzNDddLFs1OTMsMTIxLDU3M10sWzkwNSw4ODUsNjY3XSxbNzg2LDc0NCw3NDddLFsxMDAsNDEsMTA3XSxbNjA0LDMzNCw3NjVdLFs3NzksNDUwLDgyNV0sWzk2OCw5NjIsOTY5XSxbMjI1LDM2NSw0ODFdLFszNjUsMjgzLDE5Nl0sWzE2MSwxNjAsMzAzXSxbODc1LDM5OSwxNThdLFszMjgsMTgxNyw5NTRdLFs2Miw2MSwxMDc5XSxbMzU4LDgxLDcyXSxbNzQsMjExLDEzM10sWzE2MCwxNjEsMTM4XSxbOTEsNjIsMTA3OV0sWzE2Nyw1NiwxNDA1XSxbNTYsMTY3LDIxOV0sWzkxMyw5MTQsNDhdLFszNDQsNTcsMTAyXSxbNDMsNzcsMTI4XSxbMTA3NSw5NywxMDc5XSxbMzg5LDg4Miw4ODddLFsyMTksMTA4LDUzXSxbMTI0Miw4NTksMTIwXSxbNjA0LDg0MCw2MThdLFs3NTQsODcsNzYyXSxbMTk3LDM2LDEzNjJdLFsxNDM5LDg4LDEyMDBdLFsxNjUyLDMwNCw4OV0sWzgxLDQ0LDk0MF0sWzQ0NSw0NjMsMTUxXSxbNzE3LDUyMCw5Ml0sWzEyOSwxMTYsMTAwXSxbMTY2NiwxODExLDYyNF0sWzEwNzksOTcsOTFdLFs2Miw5MSw3MV0sWzY4OCw4OTgsNTI2XSxbNDYzLDc0LDEzM10sWzI3OCw4MjYsOTldLFs5NjEsMzcyLDQyXSxbNzk5LDk0LDEwMDddLFsxMDAsOTMsNDFdLFsxMzE0LDk0MywxMzAxXSxbMTg0LDIzMCwxMDldLFs4NzUsMTE5NSwyMzFdLFsxMzMsMTc2LDE4OV0sWzc1MSw3NTUsODI2XSxbMTAxLDEwMiw1N10sWzExOTgsNTEzLDExN10sWzc0OCw1MTgsOTddLFsxMTQ1LDE0ODQsMTMwNF0sWzM1OCw2NTgsODFdLFs5NzEsNjcyLDk5M10sWzQ0NSwxNTEsNDU2XSxbMjUyLDYyMSwxMjJdLFszNiwyNzEsMTI2XSxbODUsMzYsMTI2XSxbMTE2LDgzLDkzXSxbMTQxLDE3MSwxNzQ3XSxbMTA4MSw4ODMsMTAzXSxbMTM5OCwxNDU0LDE0OV0sWzQ1NywxMjEsNTkzXSxbMTI3LDExNiwzMDNdLFs2OTcsNzAsODkxXSxbNDU3LDg5MSwxNjUyXSxbMTA1OCwxNjY4LDExMl0sWzUxOCwxMzAsOTddLFsyMTQsMzE5LDEzMV0sWzE4NSwxNDUxLDE0NDldLFs0NjMsMTMzLDUxNl0sWzE0MjgsMTIzLDE3N10sWzExMyw4NjIsNTYxXSxbMjE1LDI0OCwxMzZdLFsxODYsNDIsMjUxXSxbMTI3LDgzLDExNl0sWzE2MCw4NSwxMjddLFsxNjIsMTI5LDE0MF0sWzE1NCwxNjksMTA4MF0sWzE2OSwxNzAsMTA4MF0sWzIxMCwxNzQsMTY2XSxbMTUyOSwxNDkyLDE1MjRdLFs0NTAsODc1LDIzMV0sWzM5OSw4NzUsNDUwXSxbMTcxLDE0MSwxNzBdLFsxMTMsMTE1NSw0NTJdLFsxMzEsMzE5LDM2MF0sWzQ0LDE3NSw5MDRdLFs0NTIsODcyLDExM10sWzc0Niw3NTQsNDA3XSxbMTQ3LDE0OSwxNTBdLFszMDksMzkwLDExNDhdLFs1MywxODYsMjgzXSxbNzU3LDE1OCw3OTddLFszMDMsMTI5LDE2Ml0sWzQyOSwzMDMsMTYyXSxbMTU0LDE2OCwxNjldLFs2NzMsMTY0LDE5M10sWzM4LDI3MSw3NV0sWzMyMCwyODgsMTAyMl0sWzI0Niw0NzYsMTczXSxbMTc1LDU0OCw5MDRdLFsxODIsNzI4LDQ1Nl0sWzE5OSwxNzAsMTY5XSxbMTY4LDE5OSwxNjldLFsxOTksMTcxLDE3MF0sWzE4NCwyMzgsMjMwXSxbMjQ2LDI0NywxODBdLFsxNDk2LDE0ODMsMTQ2N10sWzE0NywxNTAsMTQ4XSxbODI4LDQ3Miw0NDVdLFs1MywxMDgsMTg2XSxbNTYsNTMsMjcxXSxbMTg2LDk2MSw0Ml0sWzEzNDIsMzkxLDU3XSxbMTY2NCwxNTcsMTgzNF0sWzEwNzAsMjA0LDE3OF0sWzE3OCwyMDQsMTc5XSxbMjg1LDIxNSwyOTVdLFs2OTIsNTUsMzYwXSxbMTkyLDE5MywyODZdLFszNTksNjczLDIwOV0sWzU4NiwxOTUsNjUzXSxbMTIxLDg5LDU3M10sWzIwMiwxNzEsMTk5XSxbMjM4LDUxNSwzMTFdLFsxNzQsMjEwLDI0MF0sWzE3NCwxMDUsMTY2XSxbNzE3LDI3Niw1OTVdLFsxMTU1LDExNDksNDUyXSxbMTQwNSw1NiwxOTddLFs1MywyODMsMzBdLFs3NSw1MywzMF0sWzQ1LDIzNSwxNjUxXSxbMjEwLDE2Niw0OTBdLFsxODEsMTkzLDE5Ml0sWzE4NSw2MjAsMjE3XSxbMjYsNzk4LDc1OV0sWzEwNzAsMjI2LDIwNF0sWzIyMCwxODcsMTc5XSxbMjIwLDE2OCwxODddLFsyMDIsMjIyLDE3MV0sWzM1OSwyMDksMTgxXSxbMTgyLDQ1Niw3MzZdLFs5NjQsMTY3LDE0MDVdLFs3NiwyNTAsNDE0XSxbODA3LDEyODAsMTgzM10sWzcwLDg4MywxNjUyXSxbMjI3LDE3OSwyMDRdLFsyMjEsMTk5LDE2OF0sWzIyMSwyMDIsMTk5XSxbMzYwLDQ5NCwxMzFdLFsyMTQsMjQxLDMxOV0sWzEwNSwyNDcsMTY2XSxbMjA1LDIwMywyNjBdLFszODgsNDgwLDkzOV0sWzQ4Miw4NTUsMjExXSxbOCw4MDcsMTgzM10sWzIyNiwyNTUsMjA0XSxbMjI4LDIyMSwxNjhdLFsxNjYsMTczLDQ5MF0sWzcwMSwzNjksNzAyXSxbMjExLDg1NSwyNjJdLFs2MzEsOTIwLDYzMF0sWzE0NDgsMTE0NywxNTg0XSxbMjU1LDIyNywyMDRdLFsyMzcsMjIwLDE3OV0sWzIyOCwxNjgsMjIwXSxbMjIyLDI1Niw1NTVdLFsyMTUsMjU5LDI3OV0sWzEyNiwyNzEsMzhdLFsxMDgsNTAsMTg2XSxbMjI3LDIzNiwxNzldLFsyMzYsMjM3LDE3OV0sWzIyMCwyMzcsMjI4XSxbMjI4LDIwMiwyMjFdLFsyNTYsMjIyLDIwMl0sWzU1NSwyNTYsMjI5XSxbMjU5LDE1MiwyNzldLFsyNywxMjk2LDMxXSxbMTg2LDUwLDk2MV0sWzk2MSwyMzQsMzcyXSxbMTY1MSwyMzUsODEyXSxbMTU3MiwxMTQ3LDE0NDhdLFsyNTUsMjI2LDE3NzhdLFsyNTUsMjM2LDIyN10sWzI1NiwyNTcsMjI5XSxbMTA2LDE4NCwxMDldLFsyNDEsNDEwLDE4OF0sWzE3Nyw1NzgsNjIwXSxbMjA5LDY3MywxODFdLFsxMTM2LDE0NTcsNzldLFsxNTA3LDI0NSw3MThdLFsyNTUsMjczLDIzNl0sWzI3NSw0MTAsMjQxXSxbMjA2LDg1MSwyNTBdLFsxNDU5LDI1MywxNTk1XSxbMTQwNiw2NzcsMTY1MF0sWzIyOCwyNzQsMjAyXSxbMjAyLDI4MSwyNTZdLFszNDgsMjM5LDQ5Nl0sWzIwNSwxNzIsMjAzXSxbMzY5LDI0OCw3MDJdLFsyNjEsNTUwLDIxOF0sWzI2MSw0NjUsNTUwXSxbNTc0LDI0Myw1NjZdLFs5MjEsOTAwLDEyMjBdLFsyOTEsMjczLDI1NV0sWzM0OCwyMzgsMjY1XSxbMTA5LDIzMCwxOTRdLFsxNDksMzgwLDMyM10sWzQ0MywyNzAsNDIxXSxbMjcyLDI5MSwyNTVdLFsyNzQsMjI4LDIzN10sWzI3NCwyOTIsMjAyXSxbMjgxLDI1NywyNTZdLFsyNzYsNTQzLDM0MV0sWzE1MiwyNTksMjc1XSxbMTExMSw4MzEsMjQ5XSxbNjMyLDU1NiwzNjRdLFsyOTksMjczLDI5MV0sWzI5OSwyMzYsMjczXSxbMjgwLDIzNywyMzZdLFsyMDIsMjkyLDI4MV0sWzI0NywyNDYsMTczXSxbMjgyLDQ5LDY2XSxbMTYyMCwxMjMzLDE1NTNdLFsyOTksMjgwLDIzNl0sWzI4MCwzMDUsMjM3XSxbMjM3LDMwNSwyNzRdLFszMDYsMjkyLDI3NF0sWzMzMCwyNTcsMjgxXSxbMjQ2LDE5NCwyNjRdLFsxNjYsMjQ3LDE3M10sWzkxMiw4OTQsODk2XSxbNjExLDMyMCwyNDRdLFsxMTU0LDEwMjAsOTA3XSxbOTY5LDk2MiwyOTBdLFsyNzIsMjk5LDI5MV0sWzMwNSwzMTgsMjc0XSxbMTQ1LDIxMiwyNDBdLFsxNjQsMjQ4LDI4NV0sWzI1OSwyNzcsMjc1XSxbMTkzLDE2NCwyOTVdLFsyNjksMjQwLDIxMF0sWzEwMzMsMjg4LDMyMF0sWzQ2LDk0OCwyMDZdLFszMzYsMjgwLDI5OV0sWzMzMCwyODEsMjkyXSxbMjU3LDMwNywzMDBdLFszNjksMTM2LDI0OF0sWzE0NSwyNDAsMjY5XSxbNTAyLDg0LDQ2NV0sWzE5MywyOTUsMjg2XSxbMTY0LDI4NSwyOTVdLFsyODIsMzAyLDQ5XSxbMTYxLDMwMyw0MjldLFszMTgsMzA2LDI3NF0sWzMwNiwzMzAsMjkyXSxbMzE1LDI1NywzMzBdLFszMTUsMzA3LDI1N10sWzMwNywzNTIsMzAwXSxbMzAwLDM1MiwzMDhdLFsyNzUsMjc3LDQwM10sWzM1MywxMTQxLDMzM10sWzE0MjAsNDI1LDQ3XSxbNjExLDMxMywzMjBdLFs4NSwxMjYsODNdLFsxMjgsMTE4MCw0M10sWzMwMywxMTYsMTI5XSxbMjgwLDMxNCwzMDVdLFszMTQsMzE4LDMwNV0sWzE5MCwxODEsMjQyXSxbMjAzLDIxNCwxMzFdLFs4MjAsNzk1LDgxNV0sWzMyMiwyOTksMjcyXSxbMzIyLDMzNiwyOTldLFszMTUsMzM5LDMwN10sWzE3MiwxNTIsNjE3XSxbMTcyLDIxNCwyMDNdLFszMjEsMTAzMywzMjBdLFsxNDAxLDk0MSw5NDZdLFs4NSwxNjAsMTM4XSxbOTc2LDQ1NCw5NTFdLFs3NDcsNjAsNzg2XSxbMzE3LDMyMiwyNzJdLFszMzksMzUyLDMwN10sWzI2NiwzMyw4NjddLFsxNjMsMjI0LDIxOF0sWzI0Nyw2MTQsMTgwXSxbNjQ4LDYzOSw1NTNdLFszODgsMTcyLDIwNV0sWzYxMSwzNDUsMzEzXSxbMzEzLDM0NSwzMjBdLFsxNjAsMTI3LDMwM10sWzQ1NCw2NzIsOTUxXSxbMzE3LDMyOSwzMjJdLFszMTQsMjgwLDMzNl0sWzMwNiwzMzgsMzMwXSxbMzMwLDMzOSwzMTVdLFsxMjM2LDExNSw0MzZdLFszNDIsMzIxLDMyMF0sWzEwNDYsMzU1LDMyOF0sWzMyOCwzNDYsMzI1XSxbMzI1LDM0NiwzMTddLFszNjcsMzE0LDMzNl0sWzMxNCwzMzcsMzE4XSxbMzM3LDMwNiwzMThdLFszMzgsMzQzLDMzMF0sWzM0MiwzMjAsMzQ1XSxbMzU1LDM0OSwzMjhdLFszNDYsMzI5LDMxN10sWzM0NywzMzYsMzIyXSxbMzE0LDM2MiwzMzddLFszMzAsMzQzLDMzOV0sWzM0MCwzMDgsMzUyXSxbMTM1LDkwNiwxMDIyXSxbMjM5LDE1Niw0OTFdLFsxOTQsMjMwLDQ4Nl0sWzQwLDEwMTUsMTAwM10sWzMyMSwzNTUsMTA0Nl0sWzMyOSwzODIsMzIyXSxbMzgyLDM0NywzMjJdLFszNDcsMzY3LDMzNl0sWzMzNywzNzEsMzA2XSxbMzA2LDM3MSwzMzhdLFsxNjgxLDI5NiwxNDkzXSxbMjg2LDE3MiwzODhdLFsyMzAsMzQ4LDQ4Nl0sWzM0OCwxODMsNDg2XSxbMzg0LDMzMiw4MzBdLFszMjgsMzQ5LDM0Nl0sWzM2NywzNjIsMzE0XSxbMzcxLDM0MywzMzhdLFszMzksMzUxLDM1Ml0sWzU3LDM0NCw3OF0sWzM0MiwzNTUsMzIxXSxbMzg2LDM0NiwzNDldLFszODYsMzUwLDM0Nl0sWzM0NiwzNTAsMzI5XSxbMzQ3LDM2NiwzNjddLFszNDMsMzYzLDMzOV0sWzMyMywzODAsMzI0XSxbMTUyLDI3NSwyNDFdLFszNDUsMTA0NSwzNDJdLFszNTAsMzc0LDMyOV0sWzMzOSwzNjMsMzUxXSxbMjM0LDM0MCwzNTJdLFszNTMsMzYxLDM1NF0sWzQwLDM0LDEwMTVdLFszNzMsMzU1LDM0Ml0sWzM3MywzNDksMzU1XSxbMzc0LDM4MiwzMjldLFszNjYsMzQ3LDM4Ml0sWzM3MSwzNjMsMzQzXSxbMzUxLDM3OSwzNTJdLFszNzksMzcyLDM1Ml0sWzM3MiwyMzQsMzUyXSxbMTU2LDE5MCw0OTFdLFszMTksMjQxLDY5Ml0sWzM1NCwzNjEsMzFdLFszNjYsMzc3LDM2N10sWzM2MywzNzksMzUxXSxbMTMzLDU5MCw1MTZdLFsxOTcsNTYsMjcxXSxbMTA0NSwzNzAsMzQyXSxbMzcwLDM3MywzNDJdLFszNzQsMzUwLDM4Nl0sWzM3NywzNjYsMzgyXSxbMzY3LDM5NSwzNjJdLFs0MDAsMzM3LDM2Ml0sWzQwMCwzNzEsMzM3XSxbMzc4LDM2MywzNzFdLFsxMDYsMTA5LDYxNF0sWzE4MSw2NzMsMTkzXSxbOTUzLDkyMCw2MzFdLFszNzYsMzQ5LDM3M10sWzM3NiwzODYsMzQ5XSxbMzc4LDM3OSwzNjNdLFsyMjQsMzc1LDIxOF0sWzI3OSwxNTIsMTcyXSxbMzYxLDYxOSwzODFdLFsxMzQ3LDgyMyw3OTVdLFs3NjAsODU3LDM4NF0sWzM5MiwzNzQsMzg2XSxbMzk0LDM5NSwzNjddLFszODMsMzcxLDQwMF0sWzM4MywzNzgsMzcxXSxbMjE4LDM3NSwyNjFdLFsxOTcsMjcxLDM2XSxbNDE0LDQ1NCw5NzZdLFszODUsMzc2LDM3M10sWzEwNTEsMzgyLDM3NF0sWzM4NywzOTQsMzY3XSxbMzc3LDM4NywzNjddLFszOTUsNDAwLDM2Ml0sWzI3OSwxNzIsMjk1XSxbMzAsMzY1LDIyNV0sWzQ1MCwyMzEsODI1XSxbMzg1LDM3MywzNzBdLFszOTgsMzc0LDM5Ml0sWzEwNTEsMzc3LDM4Ml0sWzM5NiwzNzgsMzgzXSxbMzQ4LDQ5NiwxODNdLFsyOTUsMTcyLDI4Nl0sWzM1NywyNjksNDk1XSxbMTE0OCwzOTAsMTQxMV0sWzc1LDMwLDIyNV0sWzIwNiw3Niw1NF0sWzQxMiwzODYsMzc2XSxbNDEyLDM5MiwzODZdLFszOTYsMzgzLDQwMF0sWzY1MSwxMTQsODc4XSxbMTIzLDEyNDEsNTA2XSxbMjM4LDMxMSwyNjVdLFszODEsNjUzLDI5XSxbNjE4LDgxNSwzMzRdLFs0MjcsMTAzMiw0MTFdLFsyOTgsNDE0LDk3Nl0sWzc5MSwzMzIsMzg0XSxbMTI5LDEwMCwxNDBdLFs0MTIsNDA0LDM5Ml0sWzM5Miw0MDQsMzk4XSxbMTQwLDEwNywzNjBdLFszOTUsMzk0LDQwMF0sWzQyMywzNzksMzc4XSxbMzg1LDQxMiwzNzZdLFs0MDYsOTQsNThdLFs0MTksNDE1LDEwMjFdLFs0MjIsNDIzLDM3OF0sWzQyMywxMjUsMzc5XSxbMjU4LDUwOCwyMzhdLFszMTEsMTU2LDI2NV0sWzIxMywyODcsNDkxXSxbNDQ5LDQxMSwxMDI0XSxbNDEyLDEwNjgsNDA0XSxbNTUsMTQwLDM2MF0sWzc2LDQxNCw1NF0sWzM5NCw0MTYsNDAwXSxbNDAwLDQxNiwzOTZdLFs0MjIsMzc4LDM5Nl0sWzEyNTgsNzk2LDc4OV0sWzQyNyw0MTEsNDQ5XSxbNDI3LDI5NywxMDMyXSxbMTM4NSwxMzY2LDQ4M10sWzQxNyw0NDgsMjg0XSxbMTUwNywzNDEsMjQ1XSxbMTYyLDE0MCw0NDRdLFs2NTgsNDQsODFdLFs0MzMsMTI1LDQyM10sWzQzOCwyNTEsMTI1XSxbNDI5LDE2Miw0MzldLFsxMzQyLDU3LDEzNDhdLFs3NjUsNzY2LDQ0Ml0sWzY5Nyw4OTEsNjk1XSxbMTA1NywzOTYsNDE2XSxbNDQwLDQyMyw0MjJdLFs0NDAsNDMzLDQyM10sWzQzMyw0MzgsMTI1XSxbNDM4LDE5NiwyNTFdLFs3NCw0ODIsMjExXSxbMTEzNiw3OSwxNDRdLFsyOSwxOTUsNDI0XSxbMjQyLDEwMDQsNDkyXSxbNTcsNzU3LDI4XSxbNDE0LDI5OCw1NF0sWzIzOCwzNDgsMjMwXSxbMjI0LDE2MywxMjRdLFsyOTUsMjE1LDI3OV0sWzQ5NSwyNjksNDkwXSxbNDQ5LDQ0Niw0MjddLFs0NDYsMjk3LDQyN10sWzEwMjAsMTE2Myw5MDldLFsxMjgsMTM4LDQxOV0sWzY2LDk4MCw0NDNdLFs0MTUsNDM5LDEwMThdLFsxMTEsMzk2LDEwNTddLFsxMTEsNDIyLDM5Nl0sWzg0MCwyNDksODMxXSxbNTkzLDY2NCw1OTZdLFsyMTgsNTUwLDE1NV0sWzEwOSwxOTQsMTgwXSxbNDgzLDI2OCw4NTVdLFsxNjEsNDE1LDQxOV0sWzE3MzcsMjMyLDQyOF0sWzM2MCwxMDcsNDk0XSxbMTAwNiwxMDExLDQxMF0sWzQ0NCwxNDAsNTVdLFs5MTksODQzLDQzMF0sWzE5MCwyNDIsMjEzXSxbMjc1LDQwMyw0MTBdLFsxMzEsNDk0LDQ4OF0sWzQ0OSw2NjMsNDQ2XSxbMTM4LDE2MSw0MTldLFsxMjgsNDE5LDM0XSxbNDM5LDE2Miw0NDRdLFs0NjAsNDQwLDQyMl0sWzQ0MCw0MzgsNDMzXSxbNDcyLDc0LDQ0NV0sWzQ5MSwxOTAsMjEzXSxbMjM4LDUwOCw1MTVdLFs0NiwyMDYsNTRdLFs5NzIsOTQ0LDk2Ml0sWzEyNDEsMTQyOCwxMjg0XSxbMTExLDQ2MCw0MjJdLFs0NzAsNDMyLDgwNl0sWzI0OCwxNjQsNzAyXSxbMTAyNSw0NjcsNDUzXSxbNTUzLDEyMzUsNjQ4XSxbMjYzLDExNCw4ODFdLFsyNjcsMjkzLDg5Nl0sWzQ2OSw0MzgsNDQwXSxbNDU1LDE5Niw0MzhdLFsyODcsMjQyLDQ5Ml0sWzIzOSwyNjUsMTU2XSxbMjEzLDI0MiwyODddLFsxNjg0LDc0Niw2M10sWzY2Myw0NzQsNDQ2XSxbNDE1LDE2MSw0MjldLFsxNDAsMTAwLDEwN10sWzEwNTUsNDU5LDQ2N10sWzQ2OSw0NTUsNDM4XSxbMjU5LDU0MiwyNzddLFs0NDYsNDc0LDQ2Nl0sWzQ0Niw0NjYsNDQ3XSxbNDM5LDQ0NCwxMDE5XSxbNjE0LDEwOSwxODBdLFsxOTAsMzU5LDE4MV0sWzE1Niw0OTcsMTkwXSxbNzI2LDQ3NCw2NjNdLFsxMDIzLDQ1OCw0NTldLFs0NjEsNDQwLDQ2MF0sWzI2OSwyMTAsNDkwXSxbMjQ2LDE4MCwxOTRdLFs1OTAsMTMzLDE4OV0sWzE2MywyMTgsMTU1XSxbNDY3LDQ2OCw0NTNdLFsxMDYzLDEwMjksMTExXSxbMTExLDEwMjksNDYwXSxbMTAyOSw0NjQsNDYwXSxbNDYxLDQ2OSw0NDBdLFsxNTAsMTQ5LDMyM10sWzgyOCw0NDUsNDU2XSxbMzc1LDUwMiwyNjFdLFs0NzQsNDc1LDQ2Nl0sWzU3Myw0MjYsNDYyXSxbNDc4LDEwMjMsNDc3XSxbNDc4LDQ1OCwxMDIzXSxbNDU4LDQ3OSw0NjddLFs0NTksNDU4LDQ2N10sWzQ2OCwzOTMsNDUzXSxbNDY0LDQ2MSw0NjBdLFs0ODQsMzY1LDQ1NV0sWzEyMzIsMTgyLDEzODBdLFsxNzIsNjE3LDIxNF0sWzU0Nyw2OTQsMjc3XSxbNTQyLDU0NywyNzddLFsxODQsMjU4LDIzOF0sWzI2MSw1MDIsNDY1XSxbNDY3LDQ3OSw0NjhdLFs0ODQsNDU1LDQ2OV0sWzEzODAsMTgyLDg2NF0sWzQ3NSw0NzYsNDY2XSxbODAsNDQ3LDQ3Nl0sWzQ2Niw0NzYsNDQ3XSxbNDE1LDQyOSw0MzldLFs0NzksNDg3LDQ2OF0sWzQ4NywyODcsNDY4XSxbNDkyLDM5Myw0NjhdLFsyNjAsNDY5LDQ2MV0sWzQ4MSwzNjUsNDg0XSxbNTMxLDQ3Myw5MzFdLFs2OTIsMzYwLDMxOV0sWzcyNiw0OTUsNDc0XSxbNDY4LDI4Nyw0OTJdLFs0ODAsNDY0LDEwMjldLFsyNjAsNDYxLDQ2NF0sWzQ5NCw0ODEsNDg0XSxbNzQsNDcyLDQ4Ml0sWzE3NCwyNDAsMjEyXSxbMjIzLDEwNiw2MTRdLFs0ODYsNDc3LDQ4NV0sWzQ3OCw0OTYsNDU4XSxbNDkxLDQ4Nyw0NzldLFsxMjMsNDAyLDE3N10sWzQ4OCw0NjksMjYwXSxbNDg4LDQ4NCw0NjldLFsyNjUsMjM5LDM0OF0sWzI0OCwyMTUsMjg1XSxbNDc0LDQ5MCw0NzVdLFs0NzcsNDg2LDQ3OF0sWzQ1OCw0OTYsNDc5XSxbMjM5LDQ5MSw0NzldLFsxNTg0LDExNDcsMTMzNF0sWzQ4OCw0OTQsNDg0XSxbNDAxLDEyMyw1MDZdLFs0OTUsNDkwLDQ3NF0sWzQ5MCwxNzMsNDc1XSxbODAsNDc2LDI2NF0sWzQ5MSwyODcsNDg3XSxbNDgwLDEwMjksMTAwNF0sWzQ4MCwyMDUsNDY0XSxbMTczLDQ3Niw0NzVdLFs0ODUsMTk0LDQ4Nl0sWzQ4NiwxODMsNDc4XSxbNDc4LDE4Myw0OTZdLFs0OTYsMjM5LDQ3OV0sWzg0OCwxMTY2LDYwXSxbMjY4LDI2Miw4NTVdLFsyMDUsMjYwLDQ2NF0sWzI2MCwyMDMsNDg4XSxbMjAzLDEzMSw0ODhdLFsyNDYsMjY0LDQ3Nl0sWzE5NCw0ODUsMjY0XSxbMTAwMiwzMTAsMTY2NF0sWzMxMSw1MTUsNDk3XSxbNTE1LDM1OSw0OTddLFs1NjUsMzU5LDUxNV0sWzEyNTAsMTIzNiwzMDFdLFs3MzYsNDU2LDE1MV0sWzY1NCwxNzQsNTY3XSxbNTc3LDUzNCw2NDhdLFs1MTksNTA1LDY0NV0sWzcyNSw1NjUsNTA4XSxbMTUwLDE3MjMsMTQ4XSxbNTg0LDUwMiw1MDVdLFs1ODQsNTI2LDUwMl0sWzUwMiw1MjYsODRdLFs2MDcsMTkxLDY4Ml0sWzU2MCw0OTksNjYwXSxbNjA3LDUxNywxOTFdLFsxMDM4LDcxMSwxMjRdLFs5NTEsNjcyLDk3MV0sWzcxNiw1MDcsMzU2XSxbODY4LDUxMywxMTk4XSxbNjE1LDc5NCw2MDhdLFs2ODIsMTkxLDE3NF0sWzEzMTMsOTI4LDEyMTFdLFs2MTcsMjQxLDIxNF0sWzUxMSw3MSw5MV0sWzQwOCw4MDAsNzkyXSxbMTkyLDI4Niw1MjVdLFs4MCw0ODUsNDQ3XSxbOTEsOTcsMTMwXSxbMTY3NSwzMjQsODg4XSxbMjA3LDc1Niw1MzJdLFs1ODIsMTA5NywxMTI0XSxbMzExLDQ5NywxNTZdLFs1MTAsMTMwLDE0Nl0sWzUyMyw1MTEsNTEwXSxbNjA4LDcwOCw2MTZdLFs1NDYsNjkwLDY1MF0sWzUxMSw1MjcsMzU4XSxbNTM2LDE0Niw1MThdLFs0NjUsNDE4LDU1MF0sWzQxOCw3MDksNzM1XSxbNTIwLDUxNCw1MDBdLFs1ODQsNTA1LDUxOV0sWzUzNiw1MTgsNTA5XSxbMTQ2LDUzNiw1MTBdLFs1MzgsNTI3LDUxMV0sWzg3NiwyNjMsNjY5XSxbNjQ2LDUyNCw2MDVdLFs1MTAsNTM2LDUyM10sWzUyNywxNzUsMzU4XSxbNzI0LDg3Niw2NjldLFs3MjEsNzI0LDY3NF0sWzUyNCw2ODMsODM0XSxbNTU4LDUwOSw1MjJdLFs1NTgsNTM2LDUwOV0sWzUyMyw1MzgsNTExXSxbNjExLDI0Myw1NzRdLFs1MjgsNzA2LDU1Nl0sWzY2OCw1NDEsNDk4XSxbNTIzLDUzNyw1MzhdLFs1MjcsNTQwLDE3NV0sWzUzMiw3NTYsNTMzXSxbMTAxMyw2MCw3NDddLFs1NTEsNjk4LDY5OV0sWzkyLDUyMCw1MDBdLFs1MzUsNTM2LDU1OF0sWzUzNiw1NjksNTIzXSxbNTM4LDU0MCw1MjddLFs1MzksNTQ4LDE3NV0sWzU2NywyMTIsMTQ1XSxbNDAxLDg5NiwyOTNdLFs1MzQsNjc1LDYzOV0sWzE1MTAsNTk1LDE1MDddLFs1NTcsNTQ1LDUzMF0sWzU2OSw1MzYsNTM1XSxbNTM3LDU0MCw1MzhdLFs1NDAsNTM5LDE3NV0sWzU2OSw1MzcsNTIzXSxbMTEzNSw3MTgsNDddLFs1ODcsNjgxLDYyNl0sWzU4MCw1MzUsNTU4XSxbOTksNzQ3LDI3OF0sWzcwMSw1NjUsNzI1XSxbNjY1LDEzMiw1MTRdLFs2NjUsNTE0LDU3NV0sWzEzMiw1NDksNjUzXSxbMTc2LDY1MSwxODldLFs2NSw0NywyNjZdLFs1OTcsNTY5LDUzNV0sWzU2OSw1ODEsNTM3XSxbNTM3LDU4MSw1NDBdLFs1NjMsNTM5LDU0MF0sWzUzOSw1NjQsNTQ4XSxbMTUwOSwxMjMzLDE0MzRdLFsxMzIsNjUzLDc0MF0sWzU1MCw3MTAsMTU1XSxbNzE0LDcyMSw2NDRdLFs0MTAsMTAxMSwxODhdLFs3MzIsNTM0LDU4Nl0sWzU2MCw1NjIsNzI5XSxbNTU1LDU1NywyMjJdLFs1ODAsNTU4LDU0NV0sWzU5Nyw1MzUsNTgwXSxbNTgxLDU2Myw1NDBdLFs1LDgyMSwxNjc2XSxbNTc2LDIxNSwxMzZdLFs2NDksNDU3LDc0MV0sWzU2NCw1MzksNTYzXSxbMTI0LDcxMSwyMjRdLFs1NTAsNjY4LDcxMF0sWzU1MCw1NDEsNjY4XSxbNTY1LDcwMSw2NzNdLFs1NjAsNjEzLDQ5OV0sWzIzMyw1MzIsNjI1XSxbNTQ1LDU1NSw1ODBdLFs2MDEsNTgxLDU2OV0sWzU5NCw5MDQsNTQ4XSxbMTQ2MywxNDI1LDQzNF0sWzE4NSwxNDksMTQ1NF0sWzcyMSw2NzQsNjQ0XSxbMTg1LDM4MCwxNDldLFs1NzcsNDI0LDU4Nl0sWzQ2Miw1ODYsNTU5XSxbNTk3LDYwMSw1NjldLFs1OTQsNTQ4LDU2NF0sWzU2Niw2MDMsNTc0XSxbMTY1LDU0Myw1NDRdLFs0NTcsODksMTIxXSxbNTg2LDQyNCwxOTVdLFs3MjUsNTg3LDYwNl0sWzEwNzgsNTgyLDExMjRdLFs1ODgsOTI1LDg2Nl0sWzQ2Miw1NTksNTkzXSxbMTg5LDg3OCw1OTBdLFs1NTUsMjI5LDU4MF0sWzYwMiw1NjMsNTgxXSxbOTA0LDU5NCw5NTZdLFs0MzQsMTQyNSwxNDM4XSxbMTAyNCwxMTIsODIxXSxbNTcyLDU4Nyw2MjZdLFs2MDAsNTk3LDU4MF0sWzU5OSw1OTEsNjU2XSxbNjAwLDU4MCwyMjldLFs2MDEsNjIyLDU4MV0sWzU4MSw2MjIsNjAyXSxbNjAyLDU2NCw1NjNdLFs2MDIsNTk0LDU2NF0sWzYwMyw2MTEsNTc0XSxbNDk4LDUyOSw1NDZdLFs2OTcsMTE0NSw3MF0sWzU5Miw2MjgsNjI2XSxbNjEwLDU5Nyw2MDBdLFs1OTcsNjEwLDYwMV0sWzIyMiw1NTcsMTcxXSxbNjA0LDc2NSw3OTldLFs1NzMsNDYyLDU5M10sWzEzMywyMDAsMTc2XSxbNzI5LDYwNyw2MjddLFsxMDExLDY5MiwxODhdLFs1MTgsMTQ2LDEzMF0sWzU4NSw2ODcsNjA5XSxbNjgyLDYyNyw2MDddLFsxNzEyLDU5OSw2NTZdLFs1NjIsNTkyLDYwN10sWzY0Myw2NTYsNjU0XSxbMjU3LDYwMCwyMjldLFs2MDEsNjMzLDYyMl0sWzYyMyw1OTQsNjAyXSxbMTc0LDIxMiw1NjddLFs3MjUsNjA2LDcwMV0sWzYwOSw3MDEsNjA2XSxbNjEwLDYzMyw2MDFdLFs2MzMsNjQyLDYyMl0sWzM4MCwyMTYsMzI0XSxbMTQyLDE0MywxMjQ5XSxbNTAxLDczMiw1ODZdLFs1MzQsNTc3LDU4Nl0sWzY0OCwxMjM1LDU3N10sWzYxMCw2NDEsNjMzXSxbMzEwLDEwMDIsMTgzMV0sWzYxOCwzMzQsNjA0XSxbMTcxMCwxNDUsMjY5XSxbNzA3LDQ5OCw2NTldLFs1MDEsNTg2LDQ2Ml0sWzYyNSw1MDEsNDYyXSxbNzI2LDY2Myw2OTFdLFszMDAsNjAwLDI1N10sWzY0MSw2MTAsNjAwXSxbNjIyLDYyOSw2MDJdLFs2MDIsNjI5LDYyM10sWzU1LDY5Miw0NDRdLFs1MTgsNzQ4LDUwOV0sWzkyOSwxNTE1LDE0MTFdLFs2MjAsNTc4LDI2N10sWzcxLDUxMSwzNThdLFs3MDcsNjY4LDQ5OF0sWzY1MCw2ODcsNTg1XSxbNjAwLDMwMCw2NDFdLFs2NDEsNjU3LDYzM10sWzE2NzUsODg4LDE2NjldLFs2MjIsNjM2LDYyOV0sWzUwNSw1MDIsMzc1XSxbNTQxLDUyOSw0OThdLFszMzIsNDIwLDEwNTNdLFs2MzcsNTUxLDYzOF0sWzUzNCw2MzksNjQ4XSxbNjksNjIzLDg3M10sWzMwMCw1MTIsNjQxXSxbNjMzLDY1Nyw2NDJdLFs1NjIsNjYwLDU3OV0sWzY4Nyw2MzcsNjM4XSxbNzA5LDY0Niw2MDVdLFs3NzUsNzM4LDg4NV0sWzU1OSw1NDksMTMyXSxbNjQ2LDY4Myw1MjRdLFs2NDEsNTEyLDY1N10sWzI2Niw4OTcsOTQ5XSxbMTcxMiw2NDMsMTY1N10sWzE4NCw3MjcsMjU4XSxbNjc0LDcyNCw2NjldLFs2OTksNzE0LDY0N10sWzYyOCw2NTksNTcyXSxbNjU3LDY2Miw2NDJdLFs1NzEsODgxLDY1MV0sWzUxNyw2MDcsNTA0XSxbNTk4LDcwNiw1MjhdLFs1OTgsNjk0LDU0N10sWzY0MCw1NTIsNTYwXSxbNjU1LDY5Myw2OThdLFs2OTgsNjkzLDcyMV0sWzkxLDUxMCw1MTFdLFsxNDQsMzAxLDExMzZdLFszMjQsMjE2LDg4OF0sWzg3MCw3NjQsMTY4MV0sWzU3NSw1MTQsNTIwXSxbMjc2LDU0NCw1NDNdLFs2NTgsMTc1LDQ0XSxbNjQ1LDUwNSw3MTFdLFs2NTksNTQ2LDU3Ml0sWzcwMCw1MjQsNjU1XSxbNjA1LDcwMCw1MjldLFsyNjYsODY3LDg5N10sWzE2OTUsMTUyNiw3NjRdLFs1NzksNjU5LDYyOF0sWzY1NCw1OTEsNjgyXSxbNTg2LDU0OSw1NTldLFs2OTgsNzIxLDcxNF0sWzg5Niw0MDEsNTA2XSxbNjQwLDczNCw1OTldLFs2NjQsNjY1LDU3NV0sWzYyMSw2MjksNjM2XSxbMTcxMiw2NTYsNjQzXSxbNTQ3LDY0NCw1OThdLFs3MTAsNjY4LDcwN10sWzY0MCw1NjAsNzM0XSxbNjU1LDY5OCw1NTFdLFs2OTQsNTI4LDI3N10sWzUxMiw2NjIsNjU3XSxbNTA0LDU5Miw2MjZdLFs2ODgsNTg0LDUxOV0sWzE1MiwyNDEsNjE3XSxbNTg3LDcyNSw2ODFdLFs1OTgsNjY5LDcwNl0sWzUyNiw2NzAsODRdLFs1OTgsNTI4LDY5NF0sWzcxMCw3MDcsNDk5XSxbNTc5LDU5Miw1NjJdLFs2NjAsNjU5LDU3OV0sWzMyMywzMjQsMTEzNF0sWzMyNiw4OTUsNDczXSxbMTk1LDI5LDY1M10sWzg0LDY3MCw5MTVdLFs1NjAsNjYwLDU2Ml0sWzUwNCw2MjYsNjgxXSxbNzExLDUwNSwyMjRdLFs2NTEsODgxLDExNF0sWzIxNiw2MjAsODg5XSxbMTM2Miw2NzgsMTk3XSxbNDkzLDk5LDQ4XSxbMTY1OSw2OTEsNjgwXSxbNTI5LDY5MCw1NDZdLFs0MzAsODQzLDcwOV0sWzY1NSw1MjQsNjkzXSxbMTc0LDE5MSwxMDVdLFs2NzQsNjY5LDU5OF0sWzk4LDcxMiw4Ml0sWzU3Miw1NDYsNTg1XSxbNzIsNjEsNzFdLFs5MTIsOTExLDg5NF0sWzEwNiwyMjMsMTg0XSxbNjY0LDEzMiw2NjVdLFs4NDMsNjQ2LDcwOV0sWzYzNSw2OTksMTM2XSxbNjk5LDY5OCw3MTRdLFs1OTMsMTMyLDY2NF0sWzY4OCw1MjYsNTg0XSxbMTg1LDE3Nyw2MjBdLFs1MzMsNjc1LDUzNF0sWzY4Nyw2MzgsNjM1XSxbMTY1Miw4OSw0NTddLFs4OTYsNTA2LDkxMl0sWzEzMiw3NDAsNTE0XSxbNjg5LDY4NSwyODJdLFs2OTEsNDQ5LDY4MF0sWzQ4LDQzNiw0OTNdLFsxMzYsNjk5LDY0N10sWzczOSw2NDAsNTU0XSxbNTQ5LDU4Niw2NTNdLFs1MzIsNTMzLDYyNV0sWzE1MzAsNjk1LDY0OV0sWzY1MywzODEsNjE5XSxbNzM2LDE1MSw1MzFdLFsxODgsNjkyLDI0MV0sWzE3Nyw0MDIsNTc4XSxbMzMsNjg5LDg2N10sWzY4OSwzMyw2ODVdLFs1OTMsNTU5LDEzMl0sWzk0OSw2NSwyNjZdLFs3MTEsMTAzOCw2NjFdLFs5MzksNDgwLDEwMDRdLFs2MDksMzY5LDcwMV0sWzYxNiw1NTIsNjE1XSxbNjE5LDM2MSw3NDBdLFsxNTEsNDYzLDUxNl0sWzUxMyw1MjEsMTE3XSxbNjkxLDY2Myw0NDldLFsxODYsMjUxLDE5Nl0sWzMzMywzMDIsMzI3XSxbNjEzLDU2MCw1NTJdLFs2MTYsNjEzLDU1Ml0sWzY5MCw1NTEsNjM3XSxbNjYwLDcwNyw2NTldLFs3MDQsMjA4LDEyMDNdLFs0MTgsNzM1LDU1MF0sWzE2Myw3MDgsMTI0XSxbNTI0LDgzNCw2OTNdLFs1NTQsNjQwLDU5OV0sWzI0NSwzNDEsMTY1XSxbNTY1LDY3MywzNTldLFsxNTUsNzEwLDcwOF0sWzEwNSwxOTEsNTE3XSxbMTUxNSwxOTgsMTQxMV0sWzE3MDksNTU0LDU5OV0sWzYwLDI4OSw3ODZdLFs4MzgsMTI5NSwxMzk5XSxbNTMzLDUzNCw2MjVdLFs3MTAsNDk5LDcwOF0sWzU1Niw2MzIsNDEwXSxbMjE3LDYyMCwyMTZdLFs1OTEsNjI3LDY4Ml0sWzUwNCw1MDMsMjIzXSxbNjQzLDY1NCw1NjddLFs2OTAsNjM3LDY1MF0sWzU0NSw1NTcsNTU1XSxbMTc0LDY1NCw2ODJdLFs3MTksNjkxLDE2NTldLFs3MjcsNjgxLDUwOF0sWzY0NSw3MTEsNjYxXSxbNzk0LDYxNSw3MzldLFs1NjUsNTE1LDUwOF0sWzI4Miw2ODUsMzAyXSxbMTE1MCwzOTcsMTE0OV0sWzYzOCw2OTksNjM1XSxbNTQ0LDY4NSwzM10sWzcxOSw3MjYsNjkxXSxbMTc0MiwxMTI2LDE3MzNdLFsxNzI0LDE0NzUsMTQ4XSxbNTU2LDQxMCw0MDNdLFsxODUsMjE3LDM4MF0sWzUwMyw1MDQsNjgxXSxbMjc3LDU1Niw0MDNdLFszMiwxMTc4LDE1OF0sWzE3MTIsMTcwOSw1OTldLFs2MDUsNTI5LDU0MV0sWzYzNSwxMzYsMzY5XSxbNjg3LDYzNSwzNjldLFs1MjksNzAwLDY5MF0sWzcwMCw1NTEsNjkwXSxbODksMzA0LDU3M10sWzYyNSw1MzQsNzMyXSxbNzMwLDMwMiw2ODVdLFs1MDMsNjgxLDcyN10sWzcwMiw2NzMsNzAxXSxbNzMwLDMyNywzMDJdLFszMjcsMzUzLDMzM10sWzU5Niw2NjQsNTc1XSxbNjYwLDQ5OSw3MDddLFs1ODUsNTQ2LDY1MF0sWzU2MCw3MjksNzM0XSxbNzAwLDY1NSw1NTFdLFsxNzYsNTcxLDY1MV0sWzUxNyw1MDQsMjIzXSxbNzMwLDY4NSw1NDRdLFsxNjYxLDE2ODIsNzI2XSxbMTY4Miw0OTUsNzI2XSxbMTI1MCwzMDEsOTE3XSxbNjA1LDUyNCw3MDBdLFs2MDksNjg3LDM2OV0sWzUxNiwzODksODk1XSxbMTU1Myw2ODYsMTAyN10sWzY3Myw3MDIsMTY0XSxbNjU2LDU5MSw2NTRdLFs1MjAsNTk2LDU3NV0sWzQwMiwxMjMsNDAxXSxbODI4LDQ1Niw3MjhdLFsxNjQ1LDY3NywxNjUzXSxbNTI4LDU1NiwyNzddLFs2MzgsNTUxLDY5OV0sWzE5MCw0OTcsMzU5XSxbMjc2LDczMCw1NDRdLFsxMTE3LDE1MjUsOTMzXSxbMTAyNyw2ODYsMTMwNl0sWzE1NSw3MDgsMTYzXSxbNzA5LDYwNSw1NDFdLFs2NDcsNjQ0LDU0N10sWzY1MCw2MzcsNjg3XSxbNTk5LDczNCw1OTFdLFs1NzgsMjkzLDI2N10sWzE2ODIsMzU3LDQ5NV0sWzUxMCw5MSwxMzBdLFs3MzQsNzI5LDYyN10sWzU3Niw1NDIsMjE1XSxbNzA5LDU0MSw3MzVdLFs3MzUsNTQxLDU1MF0sWzI3Niw1MDAsNzMwXSxbNTAwLDMyNyw3MzBdLFs2NTMsNjE5LDc0MF0sWzQxNCw4NTEsNDU0XSxbNzM0LDYyNyw1OTFdLFs3MjksNTYyLDYwN10sWzYxNSw1NTIsNjQwXSxbNTI1LDE4MSwxOTJdLFszMDgsNTEyLDMwMF0sWzIyMyw1MDMsNzI3XSxbMjY2LDE2NSwzM10sWzkyLDUwMCwyNzZdLFszMjEsMTA0NiwxMDMzXSxbNTg1LDYwOSw2MDZdLFsxMjAwLDE1NTksODZdLFs2MjgsNTcyLDYyNl0sWzMwMSw0MzYsODAzXSxbNzE0LDY0NCw2NDddLFs3MDgsNDk5LDYxM10sWzcyMSw2OTMsNzI0XSxbNTE0LDM1MywzMjddLFszNTMsNzQwLDM2MV0sWzM0NCwxNTgsNzhdLFs3MDgsNjEzLDYxNl0sWzYxNSw2NDAsNzM5XSxbNTAwLDUxNCwzMjddLFs1MTQsNzQwLDM1M10sWzE0NDksMTc3LDE4NV0sWzQ2MiwyMzMsNjI1XSxbODUxLDQwNSwxMTYzXSxbNjA4LDYxNiw2MTVdLFs2NDcsNTQyLDU3Nl0sWzYyNSw3MzIsNTAxXSxbMTA5Nyw1ODIsMTMxMV0sWzEyMzUsNDI0LDU3N10sWzU3OSw2MjgsNTkyXSxbNjA3LDU5Miw1MDRdLFsyNCw0MzIsNDcwXSxbMTA1LDYxNCwyNDddLFsxMDQsNzQyLDQ3MV0sWzU0MiwyNTksMjE1XSxbMzY1LDE5Niw0NTVdLFsxNDIwLDQ3LDY1XSxbMjIzLDcyNywxODRdLFs1NDcsNTQyLDY0N10sWzU3Miw1ODUsNjA2XSxbNTg3LDU3Miw2MDZdLFsyNjIsNzgwLDEzNzBdLFs2NDcsNTc2LDEzNl0sWzY0NCw2NzQsNTk4XSxbMjcxLDUzLDc1XSxbNzI3LDUwOCwyNThdLFs0NzEsNzQyLDE0Ml0sWzUwNSwzNzUsMjI0XSxbMzU3LDE3MTAsMjY5XSxbNzI1LDUwOCw2ODFdLFs2NTksNDk4LDU0Nl0sWzc0MywxMTc4LDMyXSxbMTE5NSw2MzQsMjMxXSxbMTE3NiwyNCw0NzBdLFs3NDMsMTExMCwxMTc4XSxbMTM1LDgwOSw4NTddLFs2Myw3NDYsNDA3XSxbNjM0LDExNzYsNDcwXSxbMTU5LDExMTIsMjddLFsxMTc2LDE2ODUsMjRdLFszOTksNDUwLDc3OV0sWzExNzgsODU2LDg3NV0sWzc1MSw3NDQsNTRdLFs0MzYsNDgsNzcyXSxbNjM0LDExMDgsMTIxMF0sWzc2OSwxMjg1LDEyODZdLFs3NTEsMjk4LDc1NV0sWzc0NiwxNjg0LDc1NF0sWzc1NCw5MjQsODddLFs3MjIsMTYyNSw3NTZdLFs4Nyw4MzksMTUzXSxbNDg5LDc5NSw4MjBdLFs3NTgsODA4LDE1MThdLFs4MzksODQwLDE1M10sWzgzMSwxMTExLDk1OV0sWzExMTEsNzQ5LDk1OV0sWzgxMCwxMjUzLDEzNjNdLFsxMjQ3LDEzOTQsNzEzXSxbMTM4OCwxMzI5LDEyMDFdLFsxMjQyLDEyMCw3NjFdLFs4NTcsNzkxLDM4NF0sWzc1OCwxNTIzLDgwOF0sWzI5Niw3NjQsMTUwNF0sWzcwLDE2NTIsODkxXSxbMjA3LDIzMywxNjM4XSxbMTM0OCw1NywyOF0sWzg1OCw0MjAsMzMyXSxbOTY0LDEzNzksMTI3OF0sWzQyMCwxMTk0LDgxNl0sWzc4NCwxMDc2LDExODZdLFsxMDc2LDIxLDExODZdLFsxNzEwLDc2NywxXSxbODQ5LDgyMiw3NzhdLFs4MDYsMTM3LDc4N10sWzc4Niw3OTAsNzQ0XSxbNzkwLDU0LDc0NF0sWzc3MSw2Myw0MDddLFs3ODUsODUyLDgxOF0sWzc3NCwxODIzLDI3Ml0sWzg5NSwxNTEsNTE2XSxbMTM1LDEwMjIsODA5XSxbOTksODI2LDQ4XSxbNDgsODI2LDc1NV0sWzgwOCw3MDUsNDA4XSxbODMzLDQ0MSw3MTZdLFsxNzMzLDc0MywzMl0sWzEzODUsODM2LDg1Ml0sWzc3Miw4MjcsNzM3XSxbMTAwNSw0OSw3ODFdLFs3OTMsMTY5Nyw4MTNdLFsxNTE4LDQ0MSwxNTM3XSxbMTEzOSwxMTMyLDg1OV0sWzc4Miw4MDEsNzcwXSxbMTUxMCwxNTMwLDY3Nl0sWzc3MCw4MTQsODM1XSxbMjMxLDc4Nyw4MjVdLFsyMDcsNzIyLDc1Nl0sWzI2LDc3MSw3OThdLFs3ODIsODYzLDg2NV0sWzgzMiw1NCw3OTBdLFs4NjUsODQyLDUwN10sWzc5OSw3NjUsOTRdLFsxMTc1LDEyNjEsMTM1M10sWzgwMCw0MDgsODA1XSxbMjYyLDk4NiwyMDBdLFs3OTIsODAwLDgxNF0sWzgwMSw3OTIsNzcwXSxbNzA0LDEyMDMsMTE0OF0sWzM1NiwxNTE0LDgyMl0sWzE2NSw1NDQsMzNdLFs1NjEsNzc2LDExM10sWzEwNDMsNzM4LDc3NV0sWzgxNSw4MzEsODIwXSxbNzczLDc5Miw4MDFdLFs3NzIsNDgsOTE0XSxbNzcyLDczNyw4MDNdLFs0MzYsNzcyLDgwM10sWzgwOCw4MTcsNzA1XSxbMTYyNCw4MjIsMTUyN10sWzU4OCwxMTQ0LDc4OF0sWzc5OSw3NjIsNjA0XSxbODIxLDE1MjAsMTY3Nl0sWzg1NCw4MDMsNjY2XSxbODI4LDQ4Miw0NzJdLFs0NDUsNzQsNDYzXSxbODMxLDQ4OSw4MjBdLFs4MjgsODM2LDQ4Ml0sWzcxNiw3ODIsNzYzXSxbMzM0LDgxNSw3NjZdLFs4MTUsODIzLDc2Nl0sWzMzNCw3NjYsNzY1XSxbODE5LDgwNSw4MzddLFsxNzE2LDE1MjEsMTQxMl0sWzE2ODQsOTI0LDc1NF0sWzgwMCw4MDUsODE5XSxbMTcwOSw4MjksNTU0XSxbODA2LDEzNDksMTM3XSxbOTksMTAxMyw3NDddLFszNDEsNTk1LDI3Nl0sWzgxNyw4MTAsODE4XSxbMTE3NiwxNjkxLDE2ODVdLFs3NjMsNzgyLDg2NV0sWzgzMCw4NDYsMTA1Ml0sWzg2NSwxNDk5LDg0Ml0sWzk4Miw4NDYsMTA1M10sWzg0Nyw4MzIsNzkwXSxbMTE3OCw4NzUsMTU4XSxbODE3LDgxOCw3MDVdLFsxMzAyLDEzOTIsNDVdLFs5Niw0MTcsMjg0XSxbMjIzLDYxNCw1MTddLFszNTYsNTA3LDE1MTRdLFsxMTY2LDg0OCwxMTc5XSxbMTM0OSw0MzIsMjZdLFs3MTcsOTIsMjc2XSxbNzcwLDgzNSw4NjNdLFs1MjIsNTA5LDE3NDVdLFs4NDcsODQxLDgzMl0sWzgzMiw4NDEsNDZdLFs4MjksNzM5LDU1NF0sWzgwMiw4MjQsMzldLFszOTcsMTA0Myw3NzVdLFsxNTY3LDg0OSw3NzhdLFsxMzg1LDQ4Myw4NTVdLFsxMzQ5LDI2LDEzNDZdLFs0NDEsODAxLDc4Ml0sWzQwMiw0MDEsMjkzXSxbMTA0Myw2NjcsNzM4XSxbNzU5LDc5OCwxMDA3XSxbODE5LDgzNyw3MjhdLFs3MjgsODM3LDgyOF0sWzgzNyw4NTIsODI4XSxbMTUzNyw0NDEsODMzXSxbMTQ4LDE0NzUsMTQ3XSxbODA1LDcwNSw4MzddLFs3MTYsNDQxLDc4Ml0sWzQ4MywxMzcxLDc4MF0sWzgxNCw4MTksODQ0XSxbODQ1LDc1MywxMzM2XSxbMTY2MSw3MTksNF0sWzg2Miw4NDcsNzkwXSxbNzM3LDgyNyw2NjZdLFsyMDEsNDYsODQxXSxbODEwLDc4NSw4MThdLFs0MDgsNzA1LDgwNV0sWzE1NjAsMTUzNiw4NDldLFsxNTg1LDg1MywxNzg2XSxbNywxNjY4LDgwN10sWzcsODA3LDhdLFs4MjIsMTUxNCwxNTI3XSxbODAwLDgxOSw4MTRdLFs4NDcsODYyLDg0MV0sWzk5MSw4NTcsNzYwXSxbNzA1LDgxOCw4MzddLFs4MDgsNDA4LDc3M10sWzQwMiwyOTMsNTc4XSxbNzkxLDg1OCwzMzJdLFsxNDgwLDEyMjgsMTI0MF0sWzgxNCw4NDQsODM1XSxbNzg1LDEzODUsODUyXSxbMTEzMiwxMjAsODU5XSxbMTc0MywxNzI2LDY4NF0sWzE3MDQsNzgzLDEyNzldLFsxNjIzLDE2OTQsMTczMV0sWzk1OSw0ODksODMxXSxbMTUxOCw4MDgsNzczXSxbODYyLDg3Miw4NDFdLFs0NDEsNzczLDgwMV0sWzMzMSw1MTIsMzA4XSxbMzgwLDIxNywyMTZdLFs4NDEsODcyLDIwMV0sWzgxOCw4NTIsODM3XSxbNDQ4LDE0ODAsMTI0MF0sWzg1NiwxMTA4LDExOTVdLFsxNTI3LDE1MTQsMTUyNl0sWzgxOSwxODIsMTIzMl0sWzg3MSw3MjQsNjkzXSxbODUyLDgzNiw4MjhdLFs3NzAsNzkyLDgxNF0sWzgwMyw3MzcsNjY2XSxbNzUxLDgyNiwyNzhdLFsxNjc0LDE3MjcsMTY5OV0sWzg0OSwzNTYsODIyXSxbODcxLDY5Myw4MzRdLFs1MDcsODQyLDE1MTRdLFsxNDA2LDEwOTcsODY5XSxbMTMyOCwxMzQ5LDEzNDZdLFs4MjMsODE1LDc5NV0sWzc0NCw3NTEsMjc4XSxbMTExMCw4NTYsMTE3OF0sWzUyMCw3MTcsMzE2XSxbODcxLDgzNCw2ODNdLFs4ODQsODc2LDcyNF0sWzE2NSwyNjYsNDddLFs3MTYsNzYzLDUwN10sWzIxNiw4ODksODg4XSxbODUzLDE1ODUsMTU3MF0sWzE1MzYsNzE2LDM1Nl0sWzg4Niw4NzMsNjIzXSxbNzgyLDc3MCw4NjNdLFs0MzIsMjQsMjZdLFs2ODMsODgyLDg3MV0sWzg4NCw3MjQsODcxXSxbMTE0LDg3Niw4ODRdLFs1MTYsNTkwLDM4OV0sWzExLDEyMTgsMTYyOF0sWzg2MiwxMTMsODcyXSxbODg2LDYyMyw2MjldLFs4MzAsMTA1MiwxMTIwXSxbNzYyLDE1Myw2MDRdLFs3NzMsNDA4LDc5Ml0sWzc2Myw4NjUsNTA3XSxbMTUzLDg0MCw2MDRdLFs4ODIsODg0LDg3MV0sWzUzMSwxNTEsMzI2XSxbODg2LDg5MCw4NzNdLFsxMzMsMjYyLDIwMF0sWzgxOSwxMjMyLDg0NF0sWzYyMSw2MzYsMTIyXSxbNjQ1LDg5Miw1MTldLFsxMTMwLDEwNzYsNzg0XSxbMTE0LDI2Myw4NzZdLFsxNjcwLDEwLDE2NjNdLFs5MTEsNjcwLDg5NF0sWzQ1Miw4ODUsODcyXSxbODcyLDg4NSwyMDFdLFs4ODcsODgyLDY4M10sWzg3OCw4ODQsODgyXSxbNTkwLDg3OCw4ODJdLFs4OTAsODY3LDY4OV0sWzg5Nyw2MjksNjIxXSxbODk3LDg4Niw2MjldLFs4MTksNzI4LDE4Ml0sWzUxOSw4OTMsNjg4XSxbODk0LDY3MCw1MjZdLFs4OTgsODk0LDUyNl0sWzE1MzYsMzU2LDg0OV0sWzgxMCwxMzYzLDc4NV0sWzg3OCwxMTQsODg0XSxbODc5LDg4OCw4OTJdLFs4OTIsODg5LDg5M10sWzg5Myw4OTgsNjg4XSxbODk1LDY4Myw4NDNdLFs4OTUsODg3LDY4M10sWzg4OSw2MjAsMjY3XSxbNTkwLDg4MiwzODldLFs0MTgsNDY1LDg0XSxbOTQ5LDg5Nyw2MjFdLFs4OTcsODkwLDg4Nl0sWzg4OSwyNjcsODkzXSxbODk4LDI2Nyw4OTZdLFs1MzEsMzI2LDQ3M10sWzE4OSw2NTEsODc4XSxbODQzLDY4Myw2NDZdLFs4OTcsODY3LDg5MF0sWzg4OCw4ODksODkyXSxbODkzLDI2Nyw4OThdLFs4OTYsODk0LDg5OF0sWzQ3Myw4OTUsODQzXSxbODk1LDM4OSw4ODddLFs5NzQsNzA2LDY2OV0sWzUxMywxMTE1LDUyMV0sWzMyNiwxNTEsODk1XSxbODA5LDc5MSw4NTddLFsyMTEsMjYyLDEzM10sWzkyMCw5MjMsOTQ3XSxbOTIzLDkwLDk0N10sWzkwLDI1LDk0N10sWzI1LDk3Miw5MzVdLFs2NCw0MzEsODk5XSxbNTIsODk5LDkwMV0sWzkwMyw5MDUsNTldLFs0MzcsOTY3LDczXSxbODM5LDEyNDIsNzYxXSxbOTA0LDk3NSw0NF0sWzkxNywzMDEsMTQ0XSxbOTE1LDY3MCw5MTFdLFs5MDUsMjAxLDg4NV0sWzE2ODQsNjMsMTY4NV0sWzEwMzMsMTE5NCwyODhdLFs5NTAsOTEzLDc1NV0sWzkxMiw5MTgsOTExXSxbOTUwLDkxNCw5MTNdLFs1MDYsOTE4LDkxMl0sWzkyMiw5MTksOTE1XSxbOTExLDkyMiw5MTVdLFsxMDA0LDQ1MSw0OTJdLFsxMjYzLDU1Myw2MzldLFs5MjIsOTExLDkxOF0sWzYzMCw5MjAsOTQ3XSxbOTE2LDUwNiw5MjZdLFs5MTYsOTE4LDUwNl0sWzUyMSwxMTE1LDEwOThdLFs5MTYsOTIyLDkxOF0sWzkxOSw0MTgsOTE1XSxbODMsMzgsNzVdLFsyNCwxNjg1LDc3MV0sWzExMCwxMjMwLDEyMTNdLFs3MTIsOCwxODM3XSxbOTIyLDkzMCw5MTldLFs5MTksNDMwLDQxOF0sWzEzOTUsMTQwMiwxMTg3XSxbOTMwLDkyMiw5MTZdLFs1OTQsNjIzLDY5XSxbMzUsNDMxLDk2OF0sWzM1LDk2OCw5NjldLFs4NjYsOTI0LDE2ODRdLFsxNjI1LDEyNjMsNjc1XSxbNjMxLDYzMCw1Ml0sWzkzMCw5MzEsOTE5XSxbNDMwLDcwOSw0MThdLFszMDIsMzMzLDQ5XSxbMTQ0Niw5NzgsMTEzOF0sWzc5OSwxMDA3LDc5OF0sWzkzMSw4NDMsOTE5XSxbOTQ3LDI1LDY0XSxbODg1LDczOCw2NjddLFsxMjYyLDk2Myw5NjRdLFs4OTksOTcwLDkwMV0sWzE0MDEsOTQ2LDkzOF0sWzExMTcsOTMzLDEwOTFdLFsxNjg1LDYzLDc3MV0sWzkwNSw5NDgsMjAxXSxbOTc5LDkzNyw5ODBdLFs5NTEsOTUzLDk1MF0sWzkzNywyNzAsNDQzXSxbMTE1NCw5MDMsNTldLFsxMTk0LDk1NCwxMDY3XSxbOTA5LDQwNSw5MDddLFs4NTAsMTE1MSw1OV0sWzE3NjksODExLDE0MzJdLFs3NiwyMDYsMjUwXSxbOTM4LDk0Niw5NjZdLFs5NjUsOTI3LDk0Ml0sWzkzOCw5NjYsOTU3XSxbOTU1LDk3NSw5MDRdLFs5MjcsOTY1LDkzNF0sWzUyLDUxLDYzMV0sWzU5LDkwNSw2NjddLFs0MzEsOTM1LDk2OF0sWzc4NiwyODksNTYxXSxbMjUyLDEyMiw2NzFdLFs0ODEsNDk0LDEwN10sWzk1NCwxODE3LDEwNjddLFs3OTUsMjUsOTBdLFs5NTgsOTY1LDk0NV0sWzc5NSw5NzIsMjVdLFs5MDIsOTgzLDk1NV0sWzk3Miw0ODksOTQ0XSxbMTI1NiwyOSw0MjRdLFs2NzEsMzMxLDk0NV0sWzk0Niw5NTgsOTYzXSxbOTU2LDk1NSw5MDRdLFs5MDIsOTU1LDk1Nl0sWzY3MSw1MTIsMzMxXSxbOTQ1LDMzMSw5NjFdLFs2NjIsNjcxLDEyMl0sWzY3MSw2NjIsNTEyXSxbOTM0LDY1LDkyN10sWzYzMCw5NDcsNTJdLFs2NjYsNjMxLDkxMF0sWzg1MCw1OSw2NjddLFs5NjEsMzMxLDIzNF0sWzEwMjQsNDExLDEwNDJdLFs4OTAsNjksODczXSxbMjUyLDY3MSw5NDVdLFs5NzUsMjkwLDk0MF0sWzI4MywxODYsMTk2XSxbMzAsMjgzLDM2NV0sWzk1MCw3NTUsMjk4XSxbOTQ2LDk2NSw5NThdLFs5ODUsMjkwLDk3NV0sWzk2OSwyOTAsOTg1XSxbNDA1LDg1MSwyMDZdLFs5MzUsNDMxLDY0XSxbOTQxLDE0MjMsMTQyMF0sWzk2NCw5NjMsMTY3XSxbOTQyLDI1Miw5NDVdLFs3OCw3NTcsNTddLFs0OSwxMDA1LDY2XSxbOTM3LDk3OSwyNzBdLFs2MzEsNjY2LDgyN10sWzk4MCw5MzcsNDQzXSxbNjYsNjg5LDI4Ml0sWzQyMSw5MDIsOTU2XSxbOTQ3LDY0LDUyXSxbMzUsOTc5LDg5OV0sWzk1MSw5NzEsOTUzXSxbNzYyLDg3LDE1M10sWzI3LDMxLDM4MV0sWzkyNCw4MzksODddLFs5NDYsOTYzLDk2Nl0sWzMzMSwzMDgsMzQwXSxbOTU3LDk2NiwxMjYyXSxbNDczLDg0Myw5MzFdLFs5NTMsOTcxLDkyMF0sWzI3MCw5NjksOTAyXSxbOTM1LDk2Miw5NjhdLFs1MSwxMDA1LDc4MV0sWzk2OSw5ODMsOTAyXSxbNDM3LDczLDk0MF0sWzY5LDQyMSw5NTZdLFs3NjEsMjQ5LDg0MF0sWzI2Myw5NzQsNjY5XSxbOTYyLDk0NCw5NjddLFs5NjIsNDM3LDI5MF0sWzk4NSw5NzUsOTU1XSxbOTA3LDQwNSw5NDhdLFs3MjAsOTU3LDEyNjJdLFsyNSw5MzUsNjRdLFsxNzYsMjAwLDU3MV0sWzEwOCw5NDUsNTBdLFsyNTAsODUxLDQxNF0sWzIwMCw5ODYsNTcxXSxbODgxLDk3NCwyNjNdLFs4MjcsNzcyLDk1M10sWzk3MCw4OTksOTgwXSxbMjksMTU5LDI3XSxbMjM0LDMzMSwzNDBdLFs5NDgsNDA1LDIwNl0sWzk4MCw4OTksOTc5XSxbOTg2LDk4NCw1NzFdLFs1NzEsOTg0LDg4MV0sWzk5MCw3MDYsOTc0XSxbOTQ2LDkzNCw5NjVdLFs5NzAsOTgwLDY2XSxbMTExMywxNDg2LDE1NTRdLFs5ODQsOTgxLDg4MV0sWzg4MSw5ODcsOTc0XSxbNjg5LDY2LDQ0M10sWzEwMDUsOTAxLDY2XSxbOTgzLDk4NSw5NTVdLFsxNjUsNDcsNzE4XSxbOTg3LDk5MCw5NzRdLFsxMzcwLDk4NiwyNjJdLFs5MDEsOTcwLDY2XSxbNTEsOTAxLDEwMDVdLFs5ODEsOTg3LDg4MV0sWzk4OCw3MDYsOTkwXSxbOTQyLDk0NSw5NjVdLFsyOTAsNDM3LDk0MF0sWzY0LDg5OSw1Ml0sWzk4OCw1NTYsNzA2XSxbOTQxLDkzNCw5NDZdLFs0MzEsMzUsODk5XSxbOTk2LDk4OSw5ODRdLFs5ODQsOTg5LDk4MV0sWzk4MSw5ODksOTg3XSxbMzUsOTY5LDI3MF0sWzEzNzAsOTk1LDk4Nl0sWzk4Niw5OTUsOTg0XSxbOTg5LDk5OSw5ODddLFs5ODcsOTkyLDk5MF0sWzk5Miw5ODgsOTkwXSxbOTYyLDk2Nyw0MzddLFs5NTEsOTUwLDk3Nl0sWzk3OSwzNSwyNzBdLFs0MjEsMjcwLDkwMl0sWzk5OCw5OTUsMTM3MF0sWzk4Nyw5OTksOTkyXSxbOTg4LDM2NCw1NTZdLFs5NjksOTg1LDk4M10sWzY4OSw0NDMsODkwXSxbOTk1LDEwMDAsOTg0XSxbMjE5LDk1OCwxMDhdLFs5OTgsMTAwMCw5OTVdLFs5OTksOTk3LDk5Ml0sWzkxNCw5NTMsNzcyXSxbODQ1LDEzMzYsNzQ1XSxbODA2LDc4NywyMzFdLFsxMDAwLDk5Niw5ODRdLFs5ODksOTk2LDk5OV0sWzUwLDk0NSw5NjFdLFs0NDMsNDIxLDY5XSxbNzk3LDE1OCw3NzldLFsxMDk4LDE0NjMsNDM0XSxbOTk2LDEwMDksOTk5XSxbMTAwMSw5ODgsOTkyXSxbMTAwMSwzNjQsOTg4XSxbOTAzLDkwNyw5MDVdLFsyNiw3NTksOTczXSxbOTk3LDEwMDEsOTkyXSxbNjMyLDM2NCwxMDAxXSxbMTM0NiwyNiw5NzNdLFs5OTgsMTAwOCwxMDAwXSxbMTAwMCwxMDA5LDk5Nl0sWzUzMSw5MzEsNzM2XSxbMjUyLDk0OSw2MjFdLFsyODYsMzg4LDUyNV0sWzExNzQsMTAwOCw5OThdLFsxMDA5LDEwMTAsOTk5XSxbOTk5LDEwMTAsOTk3XSxbMTAxNCwxMDAxLDk5N10sWzYxNCwxMDUsNTE3XSxbOTU4LDk0NSwxMDhdLFs1MjUsMTAwNCwyNDJdLFs5NjMsOTU4LDIxOV0sWzIzMyw0MjYsMzA0XSxbMTAwMCwxMDA4LDEwMDldLFsxMDEwLDEwMTQsOTk3XSxbMTAwMSwxMDA2LDYzMl0sWzgyNCw0MTMsMzldLFs2NDIsNjM2LDYyMl0sWzQ4MCwzODgsMjA1XSxbMjgsNzU3LDc5N10sWzEwMTQsMTAwNiwxMDAxXSxbMTAwNiw0MTAsNjMyXSxbOTc1LDk0MCw0NF0sWzEyMzQsNDIwLDg1OF0sWzU0LDgzMiw0Nl0sWzEwMDksMTAxMiwxMDEwXSxbMTY3LDk2MywyMTldLFs0MSw0ODEsMTA3XSxbMTAxNywxMDEwLDEwMTJdLFsxMjIsNjM2LDY2Ml0sWzkzOSw1MjUsMzg4XSxbNTI1LDkzOSwxMDA0XSxbOTUwLDk1Myw5MTRdLFs4MjksMTczNSw3MzldLFsxMDA4LDg4MCwxMDE1XSxbMTAwOCwxMDE1LDEwMDldLFsxMjYzLDYzOSw2NzVdLFs5NTYsNTk0LDY5XSxbNzk1LDkwLDEzNDddLFsxMTc5LDg0OCwxMDEzXSxbNzU5LDEwMDcsOTczXSxbMTAwOSwxMDE1LDEwMTJdLFsxMDEyLDEwMTYsMTAxN10sWzEwMTcsMTAxNCwxMDEwXSxbMTAxOSwxMDExLDEwMDZdLFs5MjcsNjUsOTQ5XSxbNjQ5LDMxNiw1OTVdLFs5MTMsNDgsNzU1XSxbOTc2LDk1MCwyOThdLFsxMDAzLDEwMTUsODgwXSxbMTAxOCwxMDA2LDEwMTRdLFsxMDIxLDEwMTgsMTAxNF0sWzQ0NCw2OTIsMTAxMV0sWzQ1MSwxMDI5LDEwNjNdLFsxMTg1LDg1MSwxMTYzXSxbMjksMjcsMzgxXSxbMTgxLDUyNSwyNDJdLFsxMDIxLDEwMTQsMTAxN10sWzEwMTYsMTAyMSwxMDE3XSxbMTAxOCwxMDE5LDEwMDZdLFsxMDE5LDQ0NCwxMDExXSxbOTI3LDk0OSw5NDJdLFs0NTEsMzkzLDQ5Ml0sWzkwMywxMTU0LDkwN10sWzM5MSwxMDEsNTddLFs5NCw3NjUsNThdLFs0MTksMTAxNiwxMDEyXSxbOTQ5LDI1Miw5NDJdLFs5MDcsMTAyMCw5MDldLFs3NjUsNDQyLDU4XSxbOTQsNDA2LDkwOF0sWzEwMDcsOTQsOTA4XSxbMzQsMTAxMiwxMDE1XSxbMzQsNDE5LDEwMTJdLFs0MTksMTAyMSwxMDE2XSxbNDUxLDEwNTcsMzkzXSxbOTA3LDk0OCw5MDVdLFsxMDM0LDEwNzMsMTAzOV0sWzEwNjEsOTA2LDE2MTldLFsxMDY4LDk2MCwxMDM0XSxbNDcxLDEyNDksMTA0XSxbMTEyLDEwMjQsMTA0Ml0sWzM3MiwzNzksMTI1XSxbMzQxLDU0MywxNjVdLFsxNDEsMTA5NCwxNzBdLFs1NjYsMjQzLDEwNjFdLFszOTgsMTAzNCwxMDM5XSxbMzI1LDMxNywxODIzXSxbMTQ5MywyOTYsMTcyNF0sWzg1MCw2NjcsMTA0M10sWzEwNTQsMjk3LDEwNjVdLFsxNjE5LDEzNSwxMDc0XSxbMTA2MSwyNDMsOTA2XSxbNjgwLDEwMjQsODIxXSxbMTEwMyw5NiwxMjQ1XSxbMTQ0MCwxMTIzLDE0OTFdLFsxMDQ3LDEwMjUsMTA0NF0sWzY3Miw0NTQsMTIzMV0sWzE0ODQsNjk3LDE1MzBdLFs5OTMsNjcyLDEyMzFdLFsxNzgsMTU0LDEwODhdLFsxMDQ0LDEwNDEsMTA2Nl0sWzExMiwxMDYyLDEwNThdLFsxNTMwLDY0OSw2NzZdLFsxNzgsMTA4OCwxMDQwXSxbMTA0NiwzMjgsOTU0XSxbMjQzLDI0NCwxMDIyXSxbOTU0LDExOTQsMTAzM10sWzEwNDIsNDExLDEwMzJdLFs5NzEsOTkzLDEwNTZdLFs5NjAsMTA5MywxMDM0XSxbMTc1NCwxMzM4LDIzMl0sWzM4NSwxMDY0LDQxMl0sWzEwNTcsMTA2MywxMTFdLFs3NDgsMTA3MSwxNDQ3XSxbMTUzMCw2OTcsNjk1XSxbOTcxLDEwNTYsMTI3MF0sWzk3NywxMDU5LDEyMTFdLFs2NDksNzQxLDMxNl0sWzEwNjAsMTQ1MiwxMDMwXSxbMzUzLDM1NCwxMzIzXSxbNjk1LDc2OCw2NDldLFszOTgsNDA0LDEwMzRdLFs1OTYsMzE2LDc0MV0sWzE4MzYsMTE5LDEzXSxbMTUxMywxMTE1LDE1MjhdLFs4ODMsMTA4MSwxNjUyXSxbMTAzOSwxMDczLDEwNDhdLFs0NjIsNDI2LDIzM10sWzMxLDEyOTYsMzU0XSxbMTA1NSwxMDQ3LDEwNjZdLFsxMDMyLDEwNTQsMTA0NV0sWzE1MjEsMzEwLDEyMjRdLFsxMTksODYxLDEzXSxbMTE5NCwxMjM0LDI4OF0sWzExMDksMTc3MSwxMDcwXSxbMTE2NiwxMTYwLDc3Nl0sWzEwNDQsMTAzNSwxMDQxXSxbMTAyNiw5NjAsMTA2NF0sWzEwNTAsMTAzMiwxMDQ1XSxbMTA0OSwxMDQxLDM4N10sWzExNSwxMDEzLDk5XSxbMTA0Niw5NTQsMTAzM10sWzEzMjEsOTIwLDk3MV0sWzYxMSwxMDU4LDM0NV0sWzEwNDgsMTA2NiwxMDQ5XSxbMTAyMywxMDU1LDEwNzNdLFsxMDI5LDQ1MSwxMDA0XSxbMTE4LDEwOTQsMTQxXSxbMTA5NCwxMDgwLDE3MF0sWzEwNDIsMTAzMiwxMDUwXSxbMTAyNiwxMDY0LDM4NV0sWzE1LDE2LDEwODRdLFsxMDk2LDEwNzksNjFdLFsxMDc1LDEwNzEsNzQ4XSxbMzI1LDE4MTcsMzI4XSxbOTA5LDExNjMsNDA1XSxbMTAyMiwxMjM0LDgwOV0sWzM3NCwzOTgsMTA1MV0sWzEwODIsNzIsODFdLFsxMDIzLDEwMzQsMTA5M10sWzE4MTcsMTc5NCwxMDY3XSxbODYsMTQ0NSwxNDAwXSxbMTUwNywxNTM1LDE1MTBdLFsxMDc5LDEwOTYsMTA3NV0sWzU2OCwxNDc4LDExMDRdLFsxMDcwLDE3OCwxMDQwXSxbMTAzNCwxMDIzLDEwNzNdLFs3NzYsMTE1NSwxMTNdLFsxMTAzLDE0MywxNDJdLFsxMTQwLDgxLDczXSxbMTA4Miw4MSwxMTQwXSxbMTA2MCwxMDMwLDkzNl0sWzEwNDAsMTA4NiwxMTA5XSxbMzcwLDEwNjUsMzg1XSxbNjEsNzIsMTA4Ml0sWzEwODcsMTA5NiwxMTQ0XSxbMTA0MCwxMDg4LDEwODZdLFsxNjUxLDgxMiw3NTJdLFsxMDYyLDEwNTAsMTA0NV0sWzE4NywxNTQsMTc4XSxbMTc5LDE4NywxNzhdLFsxMDk5LDEzNDQsMTEwMV0sWzE2NjgsMTA1OCw4MDddLFsxMDczLDEwNTUsMTA0OF0sWzEwOTksMTMzNiwxMzQ0XSxbMTI4Myw5NDMsMTEyM10sWzEwNDksMzg3LDEwNTFdLFsxMDI0LDY4MCw0NDldLFs2MSwxMDgyLDExMDBdLFs5NjcsNzQ5LDExMTFdLFsxNDM5LDEwMzcsODhdLFs3NDIsMTUwNSwxNDJdLFszOTgsMTAzOSwxMDUxXSxbMTEwNywxMzM2LDEwOTldLFsxMzQ0LDE1NDIsMTEwMV0sWzE0MiwxNTA1LDExMDNdLFs0NzcsMTA5Myw0NDddLFs0NzcsMTAyMywxMDkzXSxbNDcxLDE0MiwxMjQ5XSxbMTA0MSwxMDM1LDM5NF0sWzEzMjgsNTY4LDExMDRdLFs2MSwxMTAwLDEwOTZdLFsxNTQsMTA5MiwxMDg4XSxbMTEyLDEwNDIsMTA1MF0sWzE1NCwxODcsMTY4XSxbNDM1LDIzNSw0NV0sWzEwNzUsMTA5NiwxMDg3XSxbOTcsMTA3NSw3NDhdLFsxMDQ5LDEwNjYsMTA0MV0sWzgxNiwxMDY3LDEwMjhdLFs4NDYsOTgyLDExNDJdLFsxMjQ1LDk2LDI4NF0sWzEwOTIsMTU0LDEwODBdLFsxMDU3LDQ1MSwxMDYzXSxbMzg3LDM3NywxMDUxXSxbMTA1NSwxMDI1LDEwNDddLFsxMDc1LDEwODcsMTA4OV0sWzExMDYsMTEwOCw4NTZdLFsxMDY4LDEwMzQsNDA0XSxbMTQ4MCwxNTQ1LDg2OF0sWzkwNiwxMzUsMTYxOV0sWzEwNzQsOTkxLDEwOTVdLFs1NzAsNTY2LDEwNjFdLFsxMDI1LDQ1MywxMDQ0XSxbNzQ1LDEzMzYsMTEwN10sWzEwMzUsMTA1Nyw0MTZdLFsxMDkyLDExMDIsMTEyOV0sWzEwNzQsMTM1LDk5MV0sWzExMDUsNzQ1LDExMDddLFs0NDcsMTAyNiw0NDZdLFszOTQsMzg3LDEwNDFdLFs3Myw4MSw5NDBdLFsxMTE4LDExMDgsMTEwNl0sWzEyMTAsMTEwOCw4NzRdLFsyNDMsMTAyMiw5MDZdLFs0MTIsMTA2NCwxMDY4XSxbMTI4MCw2MTEsNjAzXSxbOTYwLDQ0NywxMDkzXSxbMTA1MSwxMDM5LDEwNDldLFsxMDQwLDExMDksMTA3MF0sWzE0NzEsMTAzNywxNDM5XSxbNjksODkwLDQ0M10sWzEzNzcsNzAzLDEzNzRdLFsxMDkyLDEwODAsMTEwMl0sWzEwOTYsMTEwMCw3ODhdLFsxMDk2LDc4OCwxMTQ0XSxbMTExNCw5NjcsMTExMV0sWzQ0NiwxMDI2LDI5N10sWzcwLDExMTIsODgzXSxbNDUzLDM5MywxMDU3XSxbMTExOCw4NzQsMTEwOF0sWzEwNTQsMzcwLDEwNDVdLFsxMDgwLDEwOTQsMTEwMl0sWzEwMzksMTA0OCwxMDQ5XSxbNDI4LDc1Myw4NDVdLFsxMDQ3LDEwNDQsMTA2Nl0sWzEwNDQsNDUzLDEwMzVdLFsxNDcyLDczMSwxNTEyXSxbMTEyNiwxMTIxLDc0M10sWzc0MywxMTIxLDExMTBdLFsxMDMyLDI5NywxMDU0XSxbMTQ4MCw4NjgsMTIxNl0sWzcxLDM1OCw3Ml0sWzExMzMsOTY3LDExMTRdLFsxMTA1LDExMTksNzQ1XSxbMTAzNSw0NTMsMTA1N10sWzEwMjYsNDQ3LDk2MF0sWzQ1NCw4NTEsMTE5MF0sWzEwMzAsMTQ3Nyw2NTJdLFs1ODksODE2LDEwMjhdLFsxMTEwLDExMjEsMTEwNl0sWzExMjIsMTExOCwxMTA2XSxbMTExNiw4NzQsMTExOF0sWzEwNDgsMTA1NSwxMDY2XSxbMTE5NCwxMDY3LDgxNl0sWzc0NCwyNzgsNzQ3XSxbNzQ1LDExMjAsODQ1XSxbODQ1LDEwNTIsNDI4XSxbMTEwNSwxNzgwLDExMTldLFsxMDY1LDI5NywzODVdLFsxMDk4LDE1MjksMTQ2M10sWzczMSwxMDYwLDkzNl0sWzIzNSw0MzQsODEyXSxbMTQ0NSwxNTI1LDExMTddLFsxMTA2LDExMjEsMTEyMl0sWzExMjIsMTEyNywxMTE4XSxbMTEyNywxMTE2LDExMThdLFsxMDk0LDExOCwxNzMyXSxbMTExOSwxMTIwLDc0NV0sWzE0MDYsMTEyNCwxMDk3XSxbNDM1LDExNywyMzVdLFsxNDYyLDE0NDAsMTAzN10sWzExMjYsMTEyOSwxMTIxXSxbMTA4OCwxMDkyLDExMjldLFsxMTMzLDczLDk2N10sWzExMjAsMTA1Miw4NDVdLFs4MTIsNDM0LDc1Ml0sWzE0NDEsMTU1OSwxMjAwXSxbMTEzMSw1ODgsNDEzXSxbMTA1NCwxMDY1LDM3MF0sWzIzNSwxMDk4LDQzNF0sWzEwNTIsMTE0Miw0MjhdLFsxNzM3LDQyOCwxMTQyXSxbMTQ5NiwxNDQ2LDE0ODNdLFsxMTgyLDEwODMsMTY1NF0sWzExMjEsMTEyOSwxMTIyXSxbMTczMiwxMTE2LDExMjddLFs3NjgsNDU3LDY0OV0sWzc2MSwxMTE0LDI0OV0sWzEwNjQsOTYwLDEwNjhdLFsxMTM1LDE0ODEsMTEzNl0sWzExMjYsOTUyLDExMjldLFsxMDg3LDU4OCwxMTMxXSxbMTA4NywxMTQ0LDU4OF0sWzg1OSw3ODgsMTEzOV0sWzExNDAsMTEzMywxMTMyXSxbMTEzMywxMTQwLDczXSxbMTgyMiw1NzAsMTA2MV0sWzM5NCwxMDM1LDQxNl0sWzEwNTUsMTAyMyw0NTldLFs4MCwyNjQsNDg1XSxbMTExOSwxMTI4LDExMjBdLFsxNDUsMTY1OCw1NjddLFs2OTUsODkxLDc2OF0sWzExMjksMTEwMiwxMTIyXSxbMTEyMiwxMTAyLDExMjddLFsxNDE2LDEwNzcsMTQxM10sWzI5NywxMDI2LDM4NV0sWzEwNTIsODQ2LDExNDJdLFsxNDQ1LDExMTcsMTQwMF0sWzk1MiwxMDg2LDExMjldLFsxNzE0LDEwODksMTEzMV0sWzExMzEsMTA4OSwxMDg3XSxbMTEwMCwxMTM5LDc4OF0sWzExMiwxMDUwLDEwNjJdLFsxMzIzLDM1NCwxMjk2XSxbNDksMzMzLDExNDFdLFsxMTQyLDk4MiwxNzM3XSxbNzksMTQ1NywxMDkxXSxbMTA4OCwxMTI5LDEwODZdLFsxMTAyLDEwOTQsMTEyN10sWzExMjcsMTA5NCwxNzMyXSxbMTEwMCwxMDgyLDExMzldLFsxMDgyLDExMzIsMTEzOV0sWzEwODIsMTE0MCwxMTMyXSxbMTE1MCwxMDQzLDM5N10sWzYwLDExNjYsMjg5XSxbMTY5NiwxMTQ2LDE2OThdLFsxMjk3LDEyMDIsMTMxM10sWzQwOSwxMjk3LDEzMTNdLFsxMjM0LDExOTQsNDIwXSxbMTQwOCwxMzkxLDEzOTRdLFs0MjQsMTIzNSwxMjQzXSxbMTIwMywzMDksMTE0OF0sWzQ4NSw0NzcsNDQ3XSxbMTE1MiwxMTU2LDg1MF0sWzExNTMsMTE0OSwxMTU1XSxbMTE1MywxMTU3LDExNDldLFsxMTQ5LDExNTIsMTE1MF0sWzExNTYsMTE1NCwxMTUxXSxbNzc2LDExNTMsMTE1NV0sWzExNTcsMTE1MiwxMTQ5XSxbMTIxNywxMzkzLDEyMDhdLFsxMTU2LDExNTksMTE1NF0sWzExNTMsMTE2NSwxMTU3XSxbMTE2NSwxMTUyLDExNTddLFsxMTU5LDEwMjAsMTE1NF0sWzExNjEsMTE1Myw3NzZdLFsxMTYxLDExNjUsMTE1M10sWzExNjUsMTE1OCwxMTUyXSxbMTE1MiwxMTU4LDExNTZdLFsxMTU4LDExNTksMTE1Nl0sWzExNjYsNzc2LDU2MV0sWzExNjAsMTE2MSw3NzZdLFsxMTYxLDExNjQsMTE2NV0sWzExNjEsMTE2MCwxMTY0XSxbMTE1OCwxMTYyLDExNTldLFsxMTU5LDExNjIsMTAyMF0sWzEyNzAsMTMyMSw5NzFdLFsxMTY0LDExNzAsMTE2NV0sWzExNjUsMTE2MiwxMTU4XSxbMTE2MiwxMTYzLDEwMjBdLFs1ODgsNzg4LDkyNV0sWzExNjYsMTE2NywxMTYwXSxbMTE2NSwxMTcwLDExNjJdLFsxMTYwLDExNjcsMTE2NF0sWzExNjIsMTE3MCwxMTYzXSxbMTE3OSwxMTY3LDExNjZdLFsxMTY3LDExNjgsMTE2NF0sWzExNjQsMTE2OCwxMTcwXSxbMTE2OCwxMTY5LDExNzBdLFsxMjM0LDEwMjIsMjg4XSxbODAyLDM5LDg2Nl0sWzExNzksMTE2OCwxMTY3XSxbMTE2OSwxMTczLDExNzBdLFsxMTcwLDExNzMsMTE2M10sWzExNzMsMTE4NSwxMTYzXSxbMTM2MCwxMjY3LDEzNjRdLFsxMTY5LDExODUsMTE3M10sWzYxMSwyNDQsMjQzXSxbOTAwLDEyMjYsMTM3Nl0sWzEyNjAsMTQwOCwxMzUwXSxbNjE4LDg0MCw4MzFdLFsxMTgxLDExODMsMTE3OV0sWzExNzksMTE4NCwxMTY4XSxbMTIwOCwxMjc0LDEyOTFdLFsxMTgzLDExODQsMTE3OV0sWzExNjgsMTE4NCwxMTY5XSxbMTM4NywxMzk1LDEyNTRdLFsxMjA4LDEyMDQsMTE3Ml0sWzExODIsMTE5NywxMDgzXSxbMTE4NywxMDgzLDExOTddLFsxMjEzLDExODMsMTE4MV0sWzExNjksMTIwNywxMTg1XSxbMTM1LDg1Nyw5OTFdLFsxMDEzLDEyMTMsMTE4MV0sWzExODksMTE4MywxMjEzXSxbMTE4MywxMTg5LDExODRdLFsxMTY5LDExODQsMTIwN10sWzEyMDcsMTE5MCwxMTg1XSxbMTE4MCwxMzg5LDEyODhdLFsxMTkxLDExOTIsMTY0MF0sWzE2NDAsMTE5MiwxMDkwXSxbMTA5MCwxMjA1LDE2NTRdLFsxNjU0LDEyMDUsMTE4Ml0sWzExODgsMTM5NSwxMTg3XSxbMTEyNiw3NDMsMTczM10sWzc4OCw4NTksOTI1XSxbODA5LDEyMzQsMTE3MV0sWzExOTMsMTE5NywxMTgyXSxbMTE4OSwxMTk5LDExODRdLFsxNjM5LDExOTEsMTYzN10sWzE2MzksMTIxMiwxMTkxXSxbMTIwNSwxMTkzLDExODJdLFsxMTk4LDExODcsMTE5N10sWzExOTksMTIwNywxMTg0XSxbMzMyLDEwNTMsODQ2XSxbMTA5MCwxMTkyLDEyMDVdLFsxMTcsMTE4OCwxMTg3XSxbNDM1LDExODgsMTE3XSxbNDM1LDEyMDYsMTE4OF0sWzExOTksMTE4OSwxMjEzXSxbNDIwLDgxNiwxMDUzXSxbMTIxMiwxMjE1LDExOTFdLFsxMTcsMTE4NywxMTk4XSxbNDUsMTIwNiw0MzVdLFsxMjAsMTEzMiwxMTMzXSxbODc0LDExMTYsMTIxMF0sWzExOTEsMTIxNSwxMTkyXSxbMTE5MywxMjE2LDExOTddLFsxMjE2LDExOTgsMTE5N10sWzExOTksMTIxNCwxMjA3XSxbMTE3LDUyMSwyMzVdLFsxMjIwLDEzMTEsMTA3OF0sWzEyMjAsOTAwLDEzMTFdLFsxNjUzLDEyMTUsMTIxMl0sWzExOTIsMTIyNSwxMjA1XSxbMTIwNSwxMjA5LDExOTNdLFsxMjA5LDEyMTYsMTE5M10sWzEzODksMTIxNywxMTcyXSxbMTIwNywxMjE0LDQ1NF0sWzE3MSw1NTcsMTc0N10sWzE4MDUsMTA3OCwxNzg3XSxbMTgwNSwxMjE5LDEwNzhdLFsxMTk4LDEyMTYsODY4XSxbNjY2LDkxMCw4NTRdLFsxMjMwLDEyMzEsMTIxM10sWzEyMTMsMTIzMSwxMTk5XSxbMTE5OSwxMjMxLDEyMTRdLFsxMjE5LDEyMjAsMTA3OF0sWzEyMTUsMTIyMSwxMTkyXSxbMTE5MiwxMjIxLDEyMjVdLFsxMjI1LDEyMjgsMTIwNV0sWzEyMDUsMTIyOCwxMjA5XSxbMTIwOSwxMjI4LDEyMTZdLFsxNDY0LDEzMjUsMTIyM10sWzEyMTUsMTIyNywxMjIxXSxbMTIyOCwxNDgwLDEyMTZdLFsxMjI2LDE2NTMsMTM3Nl0sWzE2NTMsMTI0OSwxMjE1XSxbMTIyMSwxMjQwLDEyMjVdLFsxMjI1LDEyNDAsMTIyOF0sWzgzOSw3NjEsODQwXSxbMTIzOCwxMjE5LDE4MDVdLFsxMjM4LDEyMjAsMTIxOV0sWzEyMzIsMTM4MCwxMzc1XSxbMTIyNiwxMjQ5LDE2NTNdLFsxMjIxLDEyMjcsMTI0MF0sWzIzMywyMDcsNTMyXSxbMTEwLDEyMzYsMTIzMF0sWzEyNDgsMTIzMSwxMjMwXSxbMTIzMSw0NTQsMTIxNF0sWzEyNDksMTIyNywxMjE1XSxbMTI0OCwxMDU2LDEyMzFdLFs0ODksOTU5LDk0NF0sWzQ0OCwxMjQwLDI4NF0sWzkyNSw4NTksMTI0Ml0sWzE4MDUsMTI0NCwxMjM4XSxbMTI1MiwxMjIwLDEyMzhdLFsxMjUyLDkyMSwxMjIwXSxbMTIzNiwxMjUxLDEyMzBdLFsxMjMwLDEyNTEsMTI0OF0sWzEwNTYsOTkzLDEyMzFdLFsxMDMxLDEyNjQsMTI2M10sWzY4LDExODYsMTU3XSxbMTIyNywxMjQ1LDEyNDBdLFsxMTAzLDEyNDUsMTQzXSxbMTI0MywxMjM1LDYxMl0sWzEyNTIsOTUsOTIxXSxbMTI0OSwxMjI2LDEyMzddLFsxMzkwLDEzODcsMTI1NF0sWzExMjAsMzg0LDgzMF0sWzgzMCwzMzIsODQ2XSxbMTIyNywxNDMsMTI0NV0sWzEzMTUsMTM2OSwxMzU4XSxbMTM1NiwxMjY5LDEzODZdLFs5NzIsNzk1LDQ4OV0sWzE4MzEsMTIyNCwzMTBdLFsxMjUwLDEyNTUsMTI1MV0sWzEyNTEsMTA1NiwxMjQ4XSxbMTI1NiwxMjQzLDEwM10sWzY1OCwzNTgsMTc1XSxbMTYyMCwxMjM4LDEyNDRdLFsxNjIwLDEyNTIsMTIzOF0sWzE1MDYsOTUsMTI1Ml0sWzEwNCwxMjQ5LDEyMzddLFsxMjQ5LDE0MywxMjI3XSxbMTI2OCwxNDE5LDEzMjldLFs2MzQsODA2LDIzMV0sWzYxOCw4MzEsODE1XSxbOTI0LDEyNDIsODM5XSxbMTI1NSwxMjcwLDEyNTFdLFsxMjUxLDEyNzAsMTA1Nl0sWzg2Niw5MjUsMTI0Ml0sWzEwMywyOSwxMjU2XSxbNDI0LDEyNDMsMTI1Nl0sWzEzNCwxNjUxLDc1Ml0sWzEyNTAsOTE3LDEyNTVdLFsxMTcyLDEyMDQsMTI2MF0sWzEzNTIsMTAzNiwxMjc2XSxbMTI2NSwxMjAxLDEzMjldLFs4MDQsMTI4MiwxMjU5XSxbMTI1OSwxMjk0LDcyM10sWzMzNSwxMzMwLDEzMDVdLFs0MDcsNzYyLDc5OV0sWzg3NSw4NTYsMTE5NV0sWzMyLDE1OCwzNDRdLFs5NjcsOTQ0LDc0OV0sWzM3MiwxMjUsNDJdLFsxMTc1LDEzNTQsMTI2MV0sWzU1Myw2MTIsMTIzNV0sWzEyNTksMTI3MywxMjk0XSxbMTI5NCwxMjgzLDcyM10sWzc1Nyw3OCwxNThdLFs0MDcsNzk5LDc5OF0sWzkwMSw1MSw1Ml0sWzEzOSwxMzg2LDEzODldLFsxMzg2LDEyNjksMTM4OV0sWzEzODksMTI2OSwxMjE3XSxbMTE0OCwxNTkwLDEyNjhdLFsxNDI4LDE0NDksMTQ1MF0sWzgwNCwxMjgxLDEyODJdLFsxMjczLDEyNTksMTI4Ml0sWzE1OCwzOTksNzc5XSxbNzcxLDQwNyw3OThdLFs1MjEsMTA5OCwyMzVdLFs5MTcsMTMxMiwxMjU1XSxbMTMxMiwxMjcwLDEyNTVdLFsxMjE3LDEyNjksMTM5M10sWzExOTUsMTEwOCw2MzRdLFsxMTEwLDExMDYsODU2XSxbMTIxMCwxNjkxLDExNzZdLFsyNywxMTEyLDExNDVdLFsxMjk2LDI3LDExNDVdLFsxMTcxLDg1OCw3OTFdLFs3MDQsMTE0OCwxMjkwXSxbMTQzMCwxNDM2LDE0MzddLFsxMjgyLDEzMDgsMTI3M10sWzEzMDAsOTQzLDEyODNdLFsxMzkzLDEzNTUsMTI3NF0sWzcyMCwxMjc4LDc2OV0sWzEyODcsMTA1OSwxMzk5XSxbMTMxMCwxMzg4LDEyNzJdLFsxMzEyLDEzMjEsMTI3MF0sWzg1MSwxMTg1LDExOTBdLFsxMjk2LDExNDUsMTMwNF0sWzI2LDI0LDc3MV0sWzUxLDkxMCw2MzFdLFsxMzI5LDEyOTAsMTI2OF0sWzEyOTAsMTE0OCwxMjY4XSxbMTI5OCwxMjkzLDczM10sWzEyODEsMTI5MywxMjgyXSxbMTI4MiwxMjkzLDEzMDhdLFsxMzA4LDEyOTksMTI3M10sWzEzMDAsMTI4MywxMjk0XSxbMTM0MCw5NDMsMTMwMF0sWzEzNDAsMTMwMSw5NDNdLFs0MDcsNzU0LDc2Ml0sWzEyODcsMTM5OSwxMjk1XSxbMzQsMTM5LDEyOF0sWzEyODgsMTE3MiwxMjYwXSxbMTIwLDExMzMsMTExNF0sWzEzMDYsMTExMywxNTExXSxbMTQ2NCwxMjIzLDEyOTJdLFsxMjk5LDEyOTQsMTI3M10sWzEyOTksMTMwMCwxMjk0XSxbMTI4NiwxMjk1LDgzOF0sWzEyODUsMTI0NywxMjg2XSxbMTI0Nyw3MTMsMTI4Nl0sWzEyMDEsMTI2NSwxMzkwXSxbMTM3OCwxMzY4LDEzNTddLFsxNDgyLDEzMjAsOTE3XSxbOTE3LDEzMjAsMTMxMl0sWzg1MCwxMTU2LDExNTFdLFs1ODgsMzksNDEzXSxbMTMyNCwxMzA2LDY4Nl0sWzc4OSwxMzY1LDkyOF0sWzEyMjMsMTMyNiwxMjkyXSxbMTI5MiwxMzI2LDEyOThdLFs4NjksMTA5NywxMzExXSxbNzkwLDc4Niw1NjFdLFsxMzIzLDEzMDQsOTMyXSxbMTMyMywxMjk2LDEzMDRdLFsxMzE3LDEzMjQsNjg2XSxbMTMwNiwzNjgsMTExM10sWzEzMjUsMTM0MiwxMjIzXSxbMTMyNiwxMzQ4LDEyOThdLFsxMjkzLDEzMjcsMTMwOF0sWzEzMDgsMTMxOCwxMjk5XSxbNzA0LDEyOTAsMTI1OF0sWzEzMjAsMTMyMSwxMzEyXSxbNzYxLDEyMCwxMTE0XSxbMTY4NCw4MDIsODY2XSxbMTY3NCw2LDE3MjddLFsxMzE2LDEzMjMsOTMyXSxbMTMzNSwxMzM3LDEzMDVdLFsxMzQ4LDEzMjcsMTI5M10sWzEyOTgsMTM0OCwxMjkzXSxbMTMzMywxMzAwLDEyOTldLFsxMzMzLDEzNDMsMTMwMF0sWzEzMjgsMTMwMSwxMzQwXSxbMTMyOCwxMzE0LDEzMDFdLFs4MzgsMTM5OSwxMzE5XSxbOTIxLDEyMzcsOTAwXSxbNDA5LDEzOTEsMTQwOF0sWzEzNzYsMTY1Myw2NzddLFsxMjgxLDgwNCwxNDU4XSxbMTMzMSwxMzI0LDEzMTddLFsxMzI0LDM2OCwxMzA2XSxbMzY4LDEzMzgsMTMwN10sWzEzMjcsNzk3LDEzMDhdLFs3OTcsMTM0NSwxMzA4XSxbMTMwOCwxMzQ1LDEzMThdLFsxMzE4LDEzMzMsMTI5OV0sWzEzNDEsMTE0NywxNTcyXSxbOTIzLDEzMjEsMTMyMF0sWzkyMyw5MjAsMTMyMV0sWzM5LDU4OCw4NjZdLFsxMTQxLDEzMjMsMTMxNl0sWzEzMzAsMTMzNSwxMzA1XSxbMTMzNywxMzM1LDEzMzZdLFsxMzM5LDEzMzIsMTMyNV0sWzEyMjMsMTM0MiwxMzI2XSxbMTM0MiwxMzQ4LDEzMjZdLFsxMzQ4LDc5NywxMzI3XSxbMTM0NSwxMzMzLDEzMThdLFsxMzQzLDEzNDAsMTMwMF0sWzE0MTksMTI2NSwxMzI5XSxbMTM0NywxMzIwLDE1ODRdLFsxNTM1LDExNDEsMTMxNl0sWzEwNzgsMTMxMSw1ODJdLFsxMzQ0LDEzMzUsMTMzMF0sWzc1MywxMzMxLDEzMzddLFszNjgsMTMyNCwxMzMxXSxbNzUzLDM2OCwxMzMxXSxbMTMzMiwxNDg1LDEzMjVdLFsxMzI1LDE0ODUsMTM0Ml0sWzc4NywxMzQzLDEzMzNdLFsxMzcsMTMyOCwxMzQwXSxbOTczLDEzNDEsMTQ3OV0sWzQwNiwxMTQ3LDEzNDFdLFsxMTcxLDEyMzQsODU4XSxbMTE0MSwxNTM1LDEzMjJdLFs0OSwxMTQxLDEzMjJdLFsxMzQ0LDEzMzYsMTMzNV0sWzk3Myw5MDgsMTM0MV0sWzc2NiwxMzQ3LDE1ODRdLFsxMzQ3LDkyMywxMzIwXSxbNzgxLDQ5LDEzMjJdLFszNjgsMjMyLDEzMzhdLFs3ODcsMTM0MCwxMzQzXSxbNzg3LDEzNywxMzQwXSxbNTY4LDEzNDYsOTczXSxbNTgsMTE0Nyw0MDZdLFs0NDIsMTMzNCwxMTQ3XSxbNTgsNDQyLDExNDddLFs0NDIsNzY2LDEzMzRdLFs5MCw5MjMsMTM0N10sWzQyOCwzNjgsNzUzXSxbNzc5LDEzMzMsMTM0NV0sWzgyNSw3ODcsMTMzM10sWzEzNywxMzQ5LDEzMjhdLFsxMzI4LDEzNDYsNTY4XSxbOTA4LDQwNiwxMzQxXSxbOTI0LDg2NiwxMjQyXSxbMTMzNiw3NTMsMTMzN10sWzQyOCwyMzIsMzY4XSxbMTExNSw3NzcsMTA5OF0sWzEzNDgsMjgsNzk3XSxbNzk3LDc3OSwxMzQ1XSxbNzc5LDgyNSwxMzMzXSxbMTAwNyw5MDgsOTczXSxbNTgzLDEzNTEsODgwXSxbMTM2NSwxMjQ2LDk3N10sWzE2NTgsMTQ1LDE3MTBdLFsxMzEwLDc5NiwxMzg4XSxbNzE4LDI0NSwxNjVdLFsxMzAyLDEyNzIsMTI1NF0sWzExNzQsMTM1MSw1ODNdLFsxMTc0LDcxNSwxMzUxXSxbMTM1OCwxMjYwLDEyMDRdLFsxMzc0LDEzNzMsMTI3Nl0sWzEzNzcsMTM3NCwxMjc2XSxbNjc4LDEzNjIsMTM4Ml0sWzEzNzcsMTI3NiwyNTRdLFsxMzksMzQsNDBdLFsxMDA4LDExNzQsNTgzXSxbMTM5NiwxMjg2LDEzMTldLFs3NjgsODkxLDQ1N10sWzEzMTYsOTMyLDE1MzVdLFsxMjg5LDEzNzEsMTM2MF0sWzE4Miw3MzYsODY0XSxbMTM1NSwxMzY0LDEyNzRdLFs4NjAsMTM2NywxMzU0XSxbMTM2MiwxMjIyLDEzODJdLFsxMzc2LDg2OSwxMzExXSxbMTU5MCwxNDExLDE5OF0sWzEyMzIsMTM3NSw4NzddLFsxMzk0LDEyOTUsMTI4Nl0sWzg4MCwxMzU2LDEzODZdLFs4ODAsMTM1MSwxMzU2XSxbMTIxMSwxMDU5LDEyODddLFsxOTcsNjc4LDE0MDVdLFs4ODAsMTM4NiwxMDAzXSxbMTM2OCwxMjUzLDEzNTddLFsxMzU3LDEyNTMsMTAzNl0sWzcxNSwxMjg5LDEzNjRdLFsxMzU0LDEzNjcsNzAzXSxbMTM4Myw4NzcsMTM3NV0sWzEyNjYsMTI4OCwxMjYwXSxbMTM3MywxMzc0LDcwM10sWzEzNzIsMTI4OSwxMTc0XSxbMTMwMywxMzY2LDEzNzhdLFsxMzUxLDcxNSwxMzU1XSxbMTY2NSwxNjY2LDYyNF0sWzEzMDksMTM1NywxMDM2XSxbOTAwLDEyMzcsMTIyNl0sWzExNzQsMTI4OSw3MTVdLFsxMzM3LDEzMzEsMTMxN10sWzEzNjAsMTMwMywxMzU5XSxbMTI2NywxMzU0LDExNzVdLFsxMjQxLDEyODQsMTQxNF0sWzEzNzcsMjU0LDkyOV0sWzEzODUsODU1LDgzNl0sWzEzOTYsMTMxOSwxNDM2XSxbMTM2MSwxMzY2LDEzMDNdLFsxMzgxLDEzNjgsMTM3OF0sWzEzMTMsMTIxMSwxMzkxXSxbMTM2OCwxMzg1LDEzNjNdLFs4MTMsODIsODYxXSxbMTA1OCwxMjgwLDgwN10sWzg5Myw1MTksODkyXSxbMTM1OSwxMzAzLDg2MF0sWzEzODIsMTM1MCwxMjQ3XSxbMTM3MSwxMzAzLDEzNjBdLFsxMjY3LDExNzUsMTI3MV0sWzc2OSwxMjg2LDEzOTZdLFs3MTIsMTgzNyw4Ml0sWzEzNjYsMTM4NSwxMzgxXSxbMTM2NSw3OTYsMTMxMF0sWzEwMDMsMTM4Niw0MF0sWzc4MCwxMzcxLDEzNzBdLFs1NjEsODYyLDc5MF0sWzEyODQsMTM4MCw4NjRdLFsxNDQ5LDE0MjgsMTc3XSxbNjExLDEyODAsMTA1OF0sWzEyODQsMTM3NSwxMzgwXSxbOTI2LDUwNiwxMjQxXSxbMTMwNSwxMzM3LDEzMTddLFszMDksMTIwMywyMDhdLFsxMzg4LDEyMDEsMTM5MF0sWzEzMDksMTAzNiwxMzUyXSxbMTM3Nyw5MjksMTQxMV0sWzEzOTksMTA1OSwxMjU3XSxbMTExMiw3MCwxMTQ1XSxbMjg5LDExNjYsNTYxXSxbMTI4OCwxMzg5LDExNzJdLFsxMzYyLDM3LDExODBdLFs3MTMsMTM5NCwxMjg2XSxbMTM1NSwxMzkzLDEyNjldLFsxNDAxLDE0MjMsOTQxXSxbMTI3NCwxMjcxLDEzODRdLFs4NjAsMTM3OCwxMzY3XSxbNzE1LDEzNjQsMTM1NV0sWzY3NywxNDA2LDg2OV0sWzEyOTcsMTM1OCwxMjAyXSxbMTM4OCwxMjU4LDEzMjldLFsxMTgwLDEyODgsMTI2Nl0sWzEwMDgsNTgzLDg4MF0sWzE1MjQsMTQyNSwxNDYzXSxbMTM5MCwxNDAzLDEzODddLFsxMjc4LDEzNzksMTI0N10sWzEyNzgsMTI0NywxMjg1XSxbOTY0LDEyNzgsMTI2Ml0sWzEzNTgsMTM2OSwxMjAyXSxbMTcxNSwxNjk5LDE3MjZdLFs5MjYsMTI0MSwxNDE0XSxbMTM0MSwxNTcyLDE0NzldLFs5MjYsOTMwLDkxNl0sWzEzOTcsNTEsNzgxXSxbNDA5LDEzNTgsMTI5N10sWzEyMzYsNDM2LDMwMV0sWzEzNzYsNjc3LDg2OV0sWzEzNTEsMTM1NSwxMzU2XSxbNzU4LDE1MzQsMTUyM10sWzEzNzgsMTM1NywxMzY3XSxbOTc3LDEyMTEsMTM2NV0sWzExMzUsMTEzNiw4NTRdLFsxMzk0LDEzOTEsMTI5NV0sWzEyNjYsMTI2MCwxMjIyXSxbMTM2NSwxMzAyLDEyNDZdLFsxMjMyLDg3Nyw4NDRdLFs3MzYsOTMwLDg2NF0sWzE0MDgsMTM1OCw0MDldLFsxNTA4LDgxNywxNTIzXSxbMTM4MSwxMzg1LDEzNjhdLFs3MTgsODU0LDkxMF0sWzg1NCw3MTgsMTEzNV0sWzEzODIsMTIyMiwxMzUwXSxbMTM5MSwxMjExLDEyODddLFsxMzkxLDEyODcsMTI5NV0sWzEyNTcsMTY1MSwxMzRdLFsxNDE0LDEyODQsODY0XSxbMTI5MSwxMzY5LDEzMTVdLFsxMjAyLDkyOCwxMzEzXSxbODYsMTQwMCwxNDEzXSxbMTQxMywxMjAwLDg2XSxbMTI2MywxNjI1LDEwMzFdLFsxNDEzLDE0MDAsMTQwNF0sWzEwMDIsMTY2NCwxODM0XSxbOTMwLDkyNiwxNDE0XSxbMTM5OSwxMjU3LDEzNF0sWzUyMCwzMTYsNTk2XSxbMTM5MywxMjc0LDEyMDhdLFsxNjU3LDE2NTUsMTcxMl0sWzE0MDcsMTQwNCwxNDAwXSxbMTQwNCwxNDEwLDE0MTNdLFsxNjQ5LDEyMjksMTQwNl0sWzEzNjIsMTI2NiwxMjIyXSxbMTM4NCwxMjcxLDExNzVdLFs5MDAsMTM3NiwxMzExXSxbMTI3NCwxMzg0LDEyOTFdLFsxMjkxLDEzODQsMTQzMV0sWzE0MzMsMTM5NiwxNDM2XSxbMTI2NywxMzU5LDEzNTRdLFszMDksMTM1Myw3MDNdLFs4MzgsMTMxOSwxMjg2XSxbMTQwNywxNDEwLDE0MDRdLFs0NDEsMTUxOCw3NzNdLFsxMjQxLDEyMywxNDI4XSxbMTYyMiwxNTIxLDEyMjRdLFsxMjE3LDEyMDgsMTE3Ml0sWzExMzAsNzkzLDEwNzZdLFs0MjUsMTQwOSwxNDgxXSxbMTQ4MSwxNDA5LDE1MzNdLFsxMzAzLDEzNzgsODYwXSxbMTM1MCwxNDA4LDEzOTRdLFsxMjQ2LDE2NTEsOTc3XSxbMTI4OSwxMzYwLDEzNjRdLFsxNzI3LDE2OTQsMTYyM10sWzE0MTcsMTQwNywxNTMzXSxbMTQxNywxNDEwLDE0MDddLFsxNDA2LDE2NTAsMTY0OV0sWzEzMTksMTM0LDE0MzddLFsxNDE0LDg2NCw5MzBdLFsxNDA2LDEyMjksMTEyNF0sWzEzNTQsMTM1OSw4NjBdLFsxNDMzLDc2OSwxMzk2XSxbMTQxNywxNTMzLDE0MDldLFsxNDE2LDE0MTMsMTQxMF0sWzE0MTUsMTQxNiwxNDEwXSxbOTUsMTIzNyw5MjFdLFsxMzkyLDEyNTQsMTM5NV0sWzEzNjAsMTM1OSwxMjY3XSxbMTI1OCwxMjkwLDEzMjldLFsxMTgwLDEyOCwxMzg5XSxbMTQyMCwxNDA5LDQyNV0sWzE0MTcsMTQxOCwxNDEwXSxbMTQxOCwxNDE1LDE0MTBdLFsxNDIyLDEwNzcsMTQxNl0sWzEyNDcsMTM1MCwxMzk0XSxbMzcsNDMsMTE4MF0sWzEyMDQsMTMxNSwxMzU4XSxbMTQyOCwxMzgzLDEzNzVdLFsxMzU2LDEzNTUsMTI2OV0sWzE0MDksMTQxOCwxNDE3XSxbMTMwMiw0NSwxMjQ2XSxbMTQyMSwxNDE2LDE0MTVdLFsxNDIxLDE0MjIsMTQxNl0sWzE0MjIsMTQ5NCwxMDc3XSxbOTU3LDcyMCw5MzhdLFsxNDIzLDE0MDksMTQyMF0sWzE0MjMsMTQxOCwxNDA5XSxbNzUyLDQzNCwxNDM4XSxbMTI2MCwxMzU4LDE0MDhdLFsxMzYzLDEzODUsNzg1XSxbMTQyMywxNDI2LDE0MThdLFsxNDI2LDE0MjQsMTQxOF0sWzEyMjksMTY0OSwxMTI0XSxbMTIyMiwxMjYwLDEzNTBdLFsxNTA4LDE1MjMsMTEzN10sWzEyNzgsMTI4NSw3NjldLFsxNDgyLDkxNywxNDRdLFsxNDE4LDE0MjQsMTQxNV0sWzE0MjUsMTQyMiwxNDIxXSxbMTQyNSwxNTI0LDE0MjJdLFsxMjcyLDEzODgsMTM5MF0sWzEzOTEsNDA5LDEzMTNdLFsxMzc4LDEzNjYsMTM4MV0sWzEzNzEsNDgzLDEzNjFdLFs3MjAsMTI2MiwxMjc4XSxbMjksMTAzLDE1OV0sWzEyNzEsMTM2NCwxMjY3XSxbMTQyNCwxNDI3LDE0MTVdLFsxNTM3LDE1MjIsMTUxOF0sWzEzNCw3NTIsMTQzOF0sWzE0MjAsOTM0LDk0MV0sWzE0MjgsMTM3NSwxMjg0XSxbMTI3NywxMjI0LDE4MzFdLFsxMzYyLDExODAsMTI2Nl0sWzE0MDEsMTQyNiwxNDIzXSxbMTU3NywxMzY5LDEyOTFdLFsyNjgsNDgzLDI2Ml0sWzEzODMsMTQ1MCwxNDU2XSxbMTM4NCwxMTc1LDE0MzFdLFsxNDMwLDE0MTUsMTQyN10sWzE0MzAsMTQyMSwxNDE1XSxbMTQzMCwxNDI1LDE0MjFdLFsxMzc5LDEzODIsMTI0N10sWzEyNTIsMTU1MywxNDI5XSxbMTIwNiwxMzkyLDEzOTVdLFsxNDMzLDE0MzAsMTQyN10sWzMwOSwyMDgsMTM1M10sWzEyNzIsMTM5MCwxMjU0XSxbMTM2MSw0ODMsMTM2Nl0sWzE1MjMsODE3LDgwOF0sWzEzMDIsMTI1NCwxMzkyXSxbMTM3MSwxMzYxLDEzMDNdLFsxNDI2LDE0MzUsMTQyNF0sWzE0MzUsMTQzMywxNDI0XSxbMTQzMywxNDI3LDE0MjRdLFs3MjAsNzY5LDE0MzNdLFs3OTYsMTI1OCwxMzg4XSxbMTU5MCwxNDE5LDEyNjhdLFsxMjg5LDEzNzIsMTM3MV0sWzEzMDUsMTMxNywxNTA5XSxbOTk4LDEzNzIsMTE3NF0sWzQwLDEzODYsMTM5XSxbMTI2MSwxMzU0LDcwM10sWzEzNjQsMTI3MSwxMjc0XSxbMTM0LDE0MzgsMTQzN10sWzE0MzYsMTMxOSwxNDM3XSxbMTMxNyw2ODYsMTUwOV0sWzE0ODQsOTMyLDEzMDRdLFsxNDM0LDE0MzIsMTUwOV0sWzE0MjAsNjUsOTM0XSxbOTMxLDkzMCw3MzZdLFsxMzY3LDEzNTcsMTMwOV0sWzEzNzIsMTM3MCwxMzcxXSxbMTIwNCwxMjA4LDEzMTVdLFsxNDI2LDkzOCwxNDM1XSxbMTM2OCwxMzYzLDEyNTNdLFsxMjA3LDQ1NCwxMTkwXSxbMTMwMiwxMzEwLDEyNzJdLFszMDksMTM3NywzOTBdLFszOTAsMTM3NywxNDExXSxbMTM3MCwxMzcyLDk5OF0sWzE0MTEsMTU5MCwxMTQ4XSxbNzIwLDE0MzMsMTQzNV0sWzE0NTAsMTM4MywxNDI4XSxbMTM3OSw2NzgsMTM4Ml0sWzE0MDUsNjc4LDEzNzldLFsxMjA4LDEyOTEsMTMxNV0sWzEzOTksMTM0LDEzMTldLFsxMzY3LDEzMDksMTM3M10sWzEzNzMsMTM1MiwxMjc2XSxbNTk2LDc0MSw1OTNdLFs1NTMsMTI2NCw2MTJdLFsxNDMzLDE0MzYsMTQzMF0sWzE0MzcsMTQzOCwxNDMwXSxbOTY0LDE0MDUsMTM3OV0sWzEzNzMsMTMwOSwxMzUyXSxbMTI2NSwxNDAzLDEzOTBdLFsxMjMzLDE2MTgsMTQzNF0sWzEzNjUsMTMxMCwxMzAyXSxbNzg5LDc5NiwxMzY1XSxbNzIwLDE0MzUsOTM4XSxbMTI4LDEzOSwxMzg5XSxbMTQ2Niw5MzMsMTUyNV0sWzExOTEsMTY0MCwxNjM3XSxbMTMxNCwxNDQyLDk0M10sWzExNDEsMzUzLDEzMjNdLFsxNDg5LDExMzgsMTQ3NF0sWzE0NjIsMTQ3NywxNDQwXSxbMTQ3NCwxMTM4LDE0ODhdLFsxNDQyLDEzMTQsMTQ0M10sWzE0NDYsMTAzMCwxNTQ2XSxbMTQ4NCwxMTQ1LDY5N10sWzE1NDksMTQ0MywxNDQ1XSxbMTQ3MCwxNTcyLDE0NjhdLFsxMzk3LDEyMzksMTUwN10sWzE2NDksMTgyNSwxODI0XSxbMTI1OSwxNDQwLDE0NzddLFsxNDUxLDE0NTAsMTQ0OV0sWzk3OCwxNDQ2LDY1Ml0sWzE0NTQsMTQ1NiwxNDUxXSxbMTQ1MSwxNDU2LDE0NTBdLFszNDEsMTUwNyw1OTVdLFs5MzMsMTU0Nyw3OV0sWzgwNCwxNDUyLDEwNjBdLFsxNDU0LDE0NTUsMTQ1Nl0sWzEzOTgsMTQ2MCwxNDU0XSxbMTQ1NSw4NzcsMTQ1Nl0sWzEyNzcsMTgzMSwxODI1XSxbODA0LDEwNjAsMTQ1OF0sWzEzMzksMTQ1OSwxNTk1XSxbMTMxNCwxMTA0LDE0NDNdLFs5MzMsMTQ0OCwxNTQ3XSxbMTQ3LDE0NjAsMTM5OF0sWzE0NjAsMTQ2MSwxNDU0XSxbMTQ1NCwxNDYxLDE0NTVdLFsxMjkyLDExMjUsMTQ2NF0sWzQxNywxNTMxLDE0ODBdLFsxNDU5LDEzMzksMTMyNV0sWzgxMSwxNzU2LDMzNV0sWzE1MTIsOTM2LDE0OTBdLFs3NzcsMTUyOSwxMDk4XSxbMTQ3LDE0NzUsMTQ2MF0sWzE0NjQsMjUzLDE0NTldLFs4MzYsODU1LDQ4Ml0sWzE0ODcsMTQ4NiwxMzA3XSxbMTEwNCwxNTAxLDE0NDNdLFsxNDM5LDEyMDAsMTUzMl0sWzE0NzUsMTQ2OSwxNDYwXSxbMTQ2MCwxNDY5LDE0NjFdLFsxMzI1LDE0NjQsMTQ1OV0sWzEyNzcsMTgyNSwxNjQ5XSxbMTUzMiwxMjAwLDEwNzddLFs4NDQsODc3LDE0NTVdLFsxNTcyLDkzMywxNDY2XSxbMTQ3OSw1NjgsOTczXSxbMTUwOSwzMzUsMTMwNV0sWzEzMzksMTU5NSwxNzU5XSxbMTQ2OSwxNDc2LDE0NjFdLFsxNDYxLDE0NzYsMTQ1NV0sWzExMDQsMTQ3MCwxNDY4XSxbMTQ2NCwxNDcyLDI1M10sWzExMTcsMTA5MSwxNDA3XSxbMTc1NiwxNTQyLDMzNV0sWzEyMDYsMTM5NSwxMTg4XSxbMzM1LDE1NDIsMTMzMF0sWzgzNSw4NDQsMTQ1NV0sWzE0NzEsMTU5OCwxNDYyXSxbMTQ5MSwxNDQyLDE0NDFdLFs4MzUsMTQ1NSwxNDc2XSxbMTQ0MSwxNDQyLDE0NDNdLFsxNDg5LDE0NzQsMTQ3M10sWzEyNTEsMTIzNiwxMjUwXSxbMTAzMCwxNDUyLDE0NzddLFsxNTk4LDE0MzksMTUzMl0sWzk3OCwxNTk4LDE0OTJdLFsxNDI2LDE0MDEsOTM4XSxbMTQ0OCwxNTg0LDE0ODJdLFsxNzI0LDE0OTcsMTQ3NV0sWzE0NzUsMTQ5NywxNDY5XSxbMTQ4NCwxNTM1LDkzMl0sWzEzMDcsMTQ4NiwxMTEzXSxbMTQ4Nyw2OTYsMTQ5NV0sWzEwMzcsMTQ5MSwxNDQxXSxbMTAzMCwxNDQ2LDkzNl0sWzE0NTMsMTQ4NywxNDk1XSxbNjk2LDE0NjcsMTQ5NV0sWzExMzgsMTQ4OSwxNDgzXSxbMTQ5NywxMTQzLDE0NjldLFsxNDY5LDExNDMsMTQ3Nl0sWzY1MiwxNTk4LDk3OF0sWzg1MCwxMDQzLDExNTBdLFsxNDgyLDE1ODQsMTMyMF0sWzE3MzEsOTgsMTY5N10sWzExMTMsMTU1NCwxNTczXSxbMTUyNCwxNTMyLDE0OTRdLFsxNDk2LDE0NjcsNjk2XSxbMTQ1MiwxMjU5LDE0NzddLFsyOTYsMTUwNCwxNDk3XSxbMTUwNCwxMTQzLDE0OTddLFsxMTQzLDE0OTksMTQ3Nl0sWzcxOCw5MTAsMTQ5OF0sWzg2OCwxNTQwLDE1MjhdLFs4MTcsMTI1Myw4MTBdLFsxNDkwLDY5NiwxNDg3XSxbMTQ0MCwxNDkxLDEwMzddLFsxNTEwLDY3Niw1OTVdLFsxNDg4LDE0OTIsMTUxN10sWzc4MSwxMjM5LDEzOTddLFsxNDY3LDE1MTksMTUwM10sWzE1MDAsMTMwNywxNzU5XSxbMTE0OSwzOTcsNDUyXSxbMTUwNCwxNTE0LDExNDNdLFsxNTE0LDg0MiwxMTQzXSxbMTEyNSw3MzMsMTQ1OF0sWzE1MDMsMTUzMSwxNTU1XSxbMTI3NiwxMDM2LDExMzddLFsxNDQwLDcyMywxMTIzXSxbMTAzNiwxNTA4LDExMzddLFs4MTcsMTUwOCwxMjUzXSxbMTAzLDg4MywxMTEyXSxbMTQ1OCw3MzEsMTQ3Ml0sWzE1MTIsMTQ5MCwxNDg3XSxbMTQ4NywxNDUzLDE0ODZdLFsxMTM4LDk3OCwxNDg4XSxbMTAzNiwxMjUzLDE1MDhdLFsxMzk4LDE0OSwxNDddLFsxNDc0LDE1MTcsMTUxM10sWzExMjUsMTQ1OCwxNDcyXSxbMTQ4NiwxNDUzLDE1NTRdLFsxNTE4LDE1MzQsNzU4XSxbMzQ1LDEwNTgsMTA2Ml0sWzkyOCwxMjAyLDEzNjldLFsxNTU0LDE1NDEsMTUwNV0sWzE0NjQsMTEyNSwxNDcyXSxbMTUwNCw3NjQsMTUxNF0sWzMwNCw0MjYsNTczXSxbMTUwNSw3NDIsMTUwNl0sWzE0NzksMTU3MiwxNDc4XSxbMTUxOSwxNDgzLDE0ODldLFs4MzMsNzE2LDEwNjldLFsxNTIyLDE1MzQsMTUxOF0sWzExMTUsMTUxMyw3NzddLFs4MTEsMzM1LDE0MzJdLFsxNTkxLDE1MzMsMTQwN10sWzc3NywxNTE3LDE1MjldLFsxNTEzLDE1MTcsNzc3XSxbMTQ5OCw5MTAsMTM5N10sWzEwNjksMTUzOSw4MzNdLFs4MzMsMTUzOSwxNTM3XSxbMTUyMiwxNTUxLDE1MzRdLFsxNTM0LDE1NTEsMTUyM10sWzE1MzgsMTEzNywxNTIzXSxbOTEwLDUxLDEzOTddLFsxMzY3LDEzNzMsNzAzXSxbMTQ2NiwxNTI1LDE0NjhdLFsxNTcsMTE4NiwxODMyXSxbMTQyOSwxNTExLDE1MDZdLFsxNTczLDE1MDUsMTUwNl0sWzEyNTksMTQ1Miw4MDRdLFsxNTAzLDE0OTUsMTQ2N10sWzI2Miw0ODMsNzgwXSxbMTU3MiwxNDY2LDE0NjhdLFsxNTM2LDE1NTYsNzE2XSxbNzE2LDE1NTYsMTA2OV0sWzE1NDQsMTUyMywxNTUxXSxbMTU0NCwxNTM4LDE1MjNdLFsxNTExLDE1NzMsMTUwNl0sWzkzMywxNTcyLDE0NDhdLFsxNTQzLDE1MzcsMTUzOV0sWzE1MzcsMTU0MywxNTIyXSxbMTA5MSw5MzMsNzldLFsxNTE5LDE1NDAsMTU0NV0sWzE1NDksMTQ0NSw4Nl0sWzEwNjksMTU0OCwxNTM5XSxbMTU0OCwxNTQzLDE1MzldLFsxNTQzLDE1NTEsMTUyMl0sWzE1MDAsMTQ4NywxMzA3XSxbNjgsNzg0LDExODZdLFsxNTUyLDE1NDQsMTU1MV0sWzE1NTAsMTUzOCwxNTQ0XSxbMTUzOCwxNTUwLDExMzddLFsxNTE5LDE0NzMsMTU0MF0sWzE1NDcsMTQ0OCwxNDgyXSxbMTU2MCwxNTYzLDE1MzZdLFsxNTM2LDE1NjMsMTU1Nl0sWzE1NTYsMTU0OCwxMDY5XSxbMTU0MywxNTU4LDE1NTFdLFsxMTM3LDE1NTAsMTI3Nl0sWzE0NTMsMTQ5NSwxNTU1XSxbMTU2MSwxNTQzLDE1NDhdLFsxNTQzLDE1NjEsMTU1OF0sWzE1NTgsMTU2NiwxNTUxXSxbMTU1MiwxNTUwLDE1NDRdLFsxNTY5LDE1NTcsMTU1MF0sWzE1NTcsMTI3NiwxNTUwXSxbMTI3NiwxNTU3LDI1NF0sWzE1MzEsMTUwMywxNDgwXSxbMTUzNSwxNTMwLDE1MTBdLFsxNTQ1LDE1MDMsMTUxOV0sWzE1NDcsMTQ4Miw3OV0sWzE1NjYsMTU1MiwxNTUxXSxbMTU1MiwxNTY5LDE1NTBdLFsxNTAzLDE1NDUsMTQ4MF0sWzcwMywxMzc3LDMwOV0sWzE2MjUsNjc1LDc1Nl0sWzEwMzcsMTQ0MSw4OF0sWzkyOSwyNTQsMTU1N10sWzg0OSwxNTY3LDE1NjBdLFsxNTU2LDE1NjQsMTU0OF0sWzE0OTIsMTUyOSwxNTE3XSxbMTI1MiwxNDI5LDE1MDZdLFsxNTUzLDEwMjcsMTQyOV0sWzE0NTMsMTU1NSwxNTQxXSxbMTU1NCwxNDUzLDE1NDFdLFsxMjMzLDY4NiwxNTUzXSxbMTMyOCwxMTA0LDEzMTRdLFsxNTY0LDE1NzYsMTU0OF0sWzE1NDgsMTU3NiwxNTYxXSxbMTU1NywxNTYyLDkyOV0sWzE1MjAsMTEyLDE2NjhdLFsxNDgzLDE0NDYsMTEzOF0sWzc3OCwxNTcwLDE1NjddLFsxNTYzLDE1NjQsMTU1Nl0sWzE1NjEsMTU2NSwxNTU4XSxbMTU2NSwxNTY2LDE1NThdLFsxNTY5LDE1NTIsMTU2Nl0sWzE1NjIsMTU1NywxNTY5XSxbMTUzMCwxNTM1LDE0ODRdLFsxMzg3LDE0MDIsMTM5NV0sWzE2MjEsMTYzNCwxMzg3XSxbMTU2NywxNTY4LDE1NjBdLFsxNTYwLDE1NjgsMTU2M10sWzE1NzEsMTU2OSwxNTY2XSxbMTM0NCwxMzMwLDE1NDJdLFsxNTc3LDE0MzEsMTM1M10sWzE2MzgsMjMzLDMwNF0sWzE1MjQsMTQ2MywxNTI5XSxbMTM1MywxNDMxLDExNzVdLFsxMDc3LDEyMDAsMTQxM10sWzE0NzgsMTQ3MCwxMTA0XSxbMTU2OCwxNTc1LDE1NjNdLFsxNTYzLDE1NzUsMTU2NF0sWzE1NzUsMTU3NiwxNTY0XSxbMTU2MSwxNTc2LDE1NjVdLFsxNTY1LDE1NzQsMTU2Nl0sWzE1NjIsMTUxNSw5MjldLFsxNTU1LDk2LDE1NDFdLFsxNTMxLDQxNyw5Nl0sWzE1NTUsMTUzMSw5Nl0sWzEyNDYsNDUsMTY1MV0sWzIwOCwxNTc3LDEzNTNdLFsxNTg2LDE1NjgsMTU2N10sWzE1NzQsMTU3MSwxNTY2XSxbMTU3MSwxNTgzLDE1NjldLFsxNDc0LDE1MTMsMTUyOF0sWzEyMzksMTMyMiwxNTM1XSxbMTQ3OCwxNTcyLDE0NzBdLFsxNTcwLDE1ODYsMTU2N10sWzE0ODgsMTUxNywxNDc0XSxbOCwxODMzLDE4MzddLFsxMTIzLDE0NDIsMTQ5MV0sWzE1ODksMTU2OCwxNTg2XSxbMTU3NiwxNTk0LDE1NjVdLFsxNTY1LDE1OTQsMTU3NF0sWzE1NjIsMTk4LDE1MTVdLFsxNTU5LDE0NDEsMTU0OV0sWzE0NDEsMTQ0MywxNTQ5XSxbMTEzNSw0MjUsMTQ4MV0sWzEyMzksMTUzNSwxNTA3XSxbMTU5NSwxNDg3LDE1MDBdLFsxNTcwLDE1ODUsMTU4Nl0sWzE1ODksMTU3OCwxNTY4XSxbMTU2OCwxNTc4LDE1NzVdLFsxNTc5LDE1NjksMTU4M10sWzExNzcsMTU3NywyMDhdLFsxMTUsMTIzNiwxMTBdLFsxNTc4LDE1OTMsMTU3NV0sWzE1ODcsMTU3NiwxNTc1XSxbMTU3NiwxNTgxLDE1OTRdLFsxNTcxLDE1ODIsMTU4M10sWzE1ODgsMTU3OSwxNTgzXSxbMTU3OSwxNTgwLDE1NjJdLFsxNTY5LDE1NzksMTU2Ml0sWzE1NjIsMTU4MCwxOThdLFsxMDI3LDE1MTEsMTQyOV0sWzE1ODksMTU5MywxNTc4XSxbMTU4NywxNTgxLDE1NzZdLFsxNTgyLDE1NzQsMTU5NF0sWzE1NzQsMTU4MiwxNTcxXSxbMTU3NSwxNTkzLDE1ODddLFsxNTgzLDE1ODIsMTU4OF0sWzE1ODAsMTU5MCwxOThdLFsxNTg3LDE1OTMsMTU4MV0sWzE1MDUsMTU0MSw5Nl0sWzEzNjksMTU3NywxMTc3XSxbMTU3MywxNTU0LDE1MDVdLFsxNDc5LDE0NzgsNTY4XSxbMTU4NSwxNTg5LDE1ODZdLFsxMzY5LDExNzcsNzA0XSxbNzY2LDE1ODQsMTMzNF0sWzk3NywxMjU3LDEwNTldLFsxMDkxLDE1OTEsMTQwN10sWzE1OTEsMTA5MSwxNDU3XSxbMTU4NSwxNjA0LDE1ODldLFsxNTgxLDE1OTIsMTU5NF0sWzE2MDIsMTU4MiwxNTk0XSxbMTU4MiwxNjA4LDE1ODhdLFsxNjA4LDE1NzksMTU4OF0sWzE1NzksMTU5NywxNTgwXSxbMTQxOSwxNTkwLDE1ODBdLFsxNTk3LDE0MTksMTU4MF0sWzE0MzEsMTU3NywxMjkxXSxbMTU4OSwxNjA0LDE1OTNdLFsxNjAxLDE1OTYsMTU5M10sWzE1OTMsMTU5NiwxNTgxXSxbMTMwNiwxNTExLDEwMjddLFsxNTExLDExMTMsMTU3M10sWzE3ODYsMTQxMiwxNTg1XSxbMTQxMiwxNjA0LDE1ODVdLFsxNTgxLDE1OTYsMTU5Ml0sWzE1OTIsMTYwMiwxNTk0XSxbMTYwOCwxNTk5LDE1NzldLFsxNTk5LDE2MTEsMTU3OV0sWzE1NzksMTYxMSwxNTk3XSxbMTUxMiwxNDg3LDI1M10sWzE1MTksMTQ4OSwxNDczXSxbMTU0NSwxNTQwLDg2OF0sWzEwODMsMTE4NywxNDAyXSxbMTExNywxNDA3LDE0MDBdLFsxMjkyLDczMywxMTI1XSxbMjg0LDEyNDAsMTI0NV0sWzE2MDQsMTYwMCwxNTkzXSxbMTYwMCwxNjAxLDE1OTNdLFsxNTgyLDE2MDcsMTYwOF0sWzc4OSwxMzY5LDcwNF0sWzE0NjcsMTQ4MywxNTE5XSxbMTYwMSwxNjEzLDE1OTZdLFsxNTk2LDE2MTMsMTU5Ml0sWzE2MDIsMTYwNywxNTgyXSxbMTYyMCwxNTUzLDEyNTJdLFsxNjAxLDE2MDUsMTYxM10sWzE1OTIsMTYxMywxNjAyXSxbMTYwMiwxNjA2LDE2MDddLFsxNjA4LDE2MDksMTU5OV0sWzE1OTksMTYwOSwxNjExXSxbMTYwMywxNTk3LDE2MTFdLFsxMjY1LDE0MTksMTU5N10sWzE2MDMsMTI2NSwxNTk3XSxbMTM5MiwxMjA2LDQ1XSxbOTI4LDEzNjksNzg5XSxbMTQ3NCwxNTI4LDE0NzNdLFsxMTA0LDE0NjgsMTUwMV0sWzE0MTIsMTUyMSwxNjA0XSxbMTYxMywxNjMxLDE2MDJdLFsxNjA3LDE2MTAsMTYwOF0sWzE2MDgsMTYxMCwxNjA5XSxbMTQ3Niw4NjMsODM1XSxbMTQ5NSwxNTAzLDE1NTVdLFsxNDk4LDEzOTcsNzE4XSxbMTUyMCwxNjY4LDddLFsxNjA0LDE2MTUsMTYwMF0sWzE2MDUsMTYwMSwxNjAwXSxbMTYwMiwxNjMxLDE2MDZdLFsxNjA2LDE2MTAsMTYwN10sWzE3NTksMTU5NSwxNTAwXSxbMTI5MiwxMjk4LDczM10sWzE2MTUsMTYwNCwxNTIxXSxbMTYwOSwxNjAzLDE2MTFdLFs2NTIsMTQ2MiwxNTk4XSxbMTQ2OCwxNTI1LDE0NDVdLFsxNDQzLDE1MDEsMTQ0NV0sWzExMzQsMTcyMywxNTBdLFsxNTIxLDE2MjIsMTYxNV0sWzE2MTUsMTYxNiwxNjAwXSxbMTYxNiwxNjA1LDE2MDBdLFsxNjA1LDE2MTYsMTYxMl0sWzE2MDUsMTYxMiwxNjEzXSxbMTYxMiwxNjE3LDE2MTNdLFsxNjEzLDE2MTcsMTYzMV0sWzE2MDYsMTYxNCwxNjEwXSxbMTI2NSwxNjAzLDE0MDNdLFs0NDgsNDE3LDE0ODBdLFsxNTk1LDI1MywxNDg3XSxbMTUwMSwxNDY4LDE0NDVdLFsxMzgzLDE0NTYsODc3XSxbMTQ5MCwxNDk2LDY5Nl0sWzE2MTAsMTYyNywxNjA5XSxbMTYyNywxNjIxLDE2MDldLFsxNTkxLDE0ODEsMTUzM10sWzE1OTgsMTQ3MSwxNDM5XSxbMTM1MywxMjYxLDcwM10sWzE2MDYsMTYzMSwxNjE0XSxbMTYwOSwxNjIxLDE0MDNdLFsxNTMyLDEwNzcsMTQ5NF0sWzE1MjgsMTExNSw1MTNdLFsxNTQ2LDY1MiwxNDQ2XSxbMTIxMSw5MjgsMTM2NV0sWzE1NDAsMTQ3MywxNTI4XSxbMTA3OCwxNTAyLDE3ODddLFsxNDI1LDE0MzAsMTQzOF0sWzE2MTcsMTYzMCwxNjMxXSxbOTU5LDc0OSw5NDRdLFs1NjYsNTcwLDYwM10sWzE3MTYsMzEwLDE1MjFdLFs3NzUsNDUyLDM5N10sWzE2MTUsMTYzNiwxNjE2XSxbMTYxNiwxNjM2LDE2MTJdLFsxNjEwLDE2MzIsMTYyN10sWzc4OSw3MDQsMTI1OF0sWzE0NTcsMTQ4MSwxNTkxXSxbMTc2OSwxNzU2LDgxMV0sWzIwNywxNjI5LDcyMl0sWzE2MjksMTYyNSw3MjJdLFsxMjI0LDEyNzcsMTYyMl0sWzE2MjIsMTYzNiwxNjE1XSxbMTYzNiwxNjQ2LDE2MTJdLFsxNjEyLDE2MzAsMTYxN10sWzE2MzEsMTYyNiwxNjE0XSxbMTYxNCwxNjMyLDE2MTBdLFsxNTA2LDEwNCw5NV0sWzE0ODEsMTQ1NywxMTM2XSxbMTEyMyw5NDMsMTQ0Ml0sWzkzNiwxNDQ2LDE0OTZdLFsxNDk5LDg2MywxNDc2XSxbMTYyOSwxMDMxLDE2MjVdLFsxMjMzLDE1MDksNjg2XSxbMTYzMywxNjM0LDE2MjFdLFsxNjIxLDEzODcsMTQwM10sWzE0NzIsMTUxMiwyNTNdLFsxMTc3LDIwOCw3MDRdLFsxMjc3LDE2MzYsMTYyMl0sWzE2MjYsMTYzMiwxNjE0XSxbMTYyNywxNjMzLDE2MjFdLFs5MzYsMTQ5NiwxNDkwXSxbMTg1LDE0NTQsMTQ1MV0sWzczMSw5MzYsMTUxMl0sWzE2MzgsMTYzNSwyMDddLFs1NTMsMTI2MywxMjY0XSxbMTY1MywxMjEyLDE2MzldLFsxNjMzLDE2MjcsMTYzMl0sWzE2MzMsMTM4NywxNjM0XSxbMTQ1OCwxMDYwLDczMV0sWzM2OCwxMzA3LDExMTNdLFsxMjY0LDEwMzEsMTYyOV0sWzExNTIsODUwLDExNTBdLFsxMjc3LDE2NDQsMTYzNl0sWzE2NDYsMTYzNywxNjEyXSxbMTYzNywxNjMwLDE2MTJdLFsxNjQ3LDE2MzEsMTYzMF0sWzE2NDcsMTYyNiwxNjMxXSxbMTQyMiwxNTI0LDE0OTRdLFsxMDMwLDY1MiwxNTQ2XSxbMTYzNSwxNjI5LDIwN10sWzE2MzUsMTI2NCwxNjI5XSxbMTYzOSwxNjQ2LDE2MzZdLFsxNjM3LDE2NDAsMTYzMF0sWzE2NDEsMTYzMiwxNjI2XSxbMTYzMiwxNjQyLDE2MzNdLFsxNjMzLDE2NDMsMTM4N10sWzg0MiwxNDk5LDExNDNdLFs4NjUsODYzLDE0OTldLFsxNTE2LDk3OCwxNDkyXSxbNjcsMTEzMCw3ODRdLFsxMTAzLDE1MDUsOTZdLFs4OCwxNDQxLDEyMDBdLFsxNjQ0LDE2MzksMTYzNl0sWzE2NDAsMTY0NywxNjMwXSxbMTY0NywxNjQxLDE2MjZdLFsxNjMzLDE2NDgsMTY0M10sWzE0OTIsMTUzMiwxNTI0XSxbMTQ4OCwxNTE2LDE0OTJdLFsxMDM3LDE0NzEsMTQ2Ml0sWzYxMiwxMjY0LDE2MzVdLFsxNTAyLDEwNzgsMTEyNF0sWzE2NDEsMTY0MiwxNjMyXSxbMTY0OCwxNjMzLDE2NDJdLFsxNTI4LDUxMyw4NjhdLFsxNDkyLDE1OTgsMTUzMl0sWzEwOTUsOTkxLDc2MF0sWzY3OSwxNTcsMTY2NF0sWzc2MCwxMTI4LDE3ODVdLFsxMjc3LDE2NTAsMTY0NF0sWzMyMCwxMDIyLDI0NF0sWzE1NTksMTU0OSw4Nl0sWzE2NzYsMTUyMCw3XSxbMTQ4OCw5NzgsMTUxNl0sWzEwOTUsNzYwLDE3ODVdLFsxMTI4LDM4NCwxMTIwXSxbMzA0LDMxMiwxNjM4XSxbMTA4MSwxNjM4LDMxMl0sWzEwODEsMTYzNSwxNjM4XSxbMTAzLDYxMiwxNjM1XSxbNjUyLDE0NzcsMTQ2Ml0sWzE2NTAsMTY0NSwxNjQ0XSxbMTY0NSwxNjM5LDE2NDRdLFsxNjM5LDE2MzcsMTY0Nl0sWzE2NDAsMTA5MCwxNjQ3XSxbMTY1NCwxNjQxLDE2NDddLFsxNjU0LDE2NDIsMTY0MV0sWzE2NTQsMTY0OCwxNjQyXSxbMTY0MywxNDAyLDEzODddLFsxNDMyLDMzNSwxNTA5XSxbMzg0LDExMjgsNzYwXSxbMTY1MiwzMTIsMzA0XSxbMTAzLDEyNDMsNjEyXSxbMTI3NywxNjQ5LDE2NTBdLFsxMDkwLDE2NTQsMTY0N10sWzE2NDMsMTY0OCwxNDAyXSxbMTEzNCwzMjQsMTY3NV0sWzY3OSw2OCwxNTddLFsxNjUyLDEwODEsMzEyXSxbMTEzNiwzMDEsODAzXSxbMTY1MywxNjM5LDE2NDVdLFs3MjMsMTQ0MCwxMjU5XSxbODAzLDg1NCwxMTM2XSxbMTA0LDE1MDYsNzQyXSxbMTExMiwxNTksMTAzXSxbMTY1NCwxMDgzLDE2NDhdLFs5NzcsMTY1MSwxMjU3XSxbMTM5NywxNTA3LDcxOF0sWzEwODEsMTAzLDE2MzVdLFsxNjUwLDY3NywxNjQ1XSxbMTA4MywxNDAyLDE2NDhdLFsxNzA2LDE2NTUsMTY3MV0sWzE2MjQsMTcwNCwxNzExXSxbNzY3LDIsMV0sWzYwOCw3OTQsMjk0XSxbMTY3OCwxNjgzLDE2ODZdLFs3NjcsMTY4MiwyXSxbMTY2OSwxNjkyLDE2NzVdLFsyOTYsMTY4MSw3NjRdLFsxNjcxLDE2NTYsMTY3Ml0sWzE3LDE2NzMsMTY3OV0sWzE3MDYsMTY3MSwxNjczXSxbMTY2MiwxNjc0LDE2OTldLFsxNjU1LDE2NTcsMTY1Nl0sWzQxOCw4NCw5MTVdLFsxNTI2LDE1MTQsNzY0XSxbMTY1OCwxNjU3LDU2N10sWzg3MCwxNjk1LDc2NF0sWzgxMywxNjk3LDk4XSxbMTY1OSw4MjEsNV0sWzYwLDEwMTMsODQ4XSxbMTAxMywxMTAsMTIxM10sWzY2MSwxMDM4LDE2OTJdLFsxNjYwLDE3MDMsMTddLFsxNjkzLDE2NzMsMTddLFsxNjYzLDE3MTUsMTc0M10sWzEwMTMsMTE1LDExMF0sWzM0NCwxNzMzLDMyXSxbMTY3MCwxNjYzLDE3NDNdLFsxNjcwLDE3NDMsMTczOF0sWzE2NzcsMTY3MCwxNzM4XSxbMTY2MSw0LDNdLFsxMDg0LDE2ODMsMTY3OF0sWzE3MjgsNzkzLDExMzBdLFsxNjgzLDE3NjcsMTE5Nl0sWzE2NzcsMTczOCwxMTk2XSxbMTI3OSwxNzg2LDg1M10sWzI5NCwxMDM4LDYwOF0sWzEyNzksMTY4OSwxNzg2XSxbODcwLDE4LDE3MDhdLFs4NzAsMTY4MCwxNjk1XSxbMTcwNSwxMCwxNjcwXSxbMTA4NCwxNzY3LDE2ODNdLFsxMTk2LDE3MzgsMTY4Nl0sWzE3NTAsODcwLDE2ODFdLFsxNzUwLDE4LDg3MF0sWzE3NzMsMTcwMywxNjYwXSxbMTEzNSw0Nyw0MjVdLFsxNTAsMzIzLDExMzRdLFsxNzA3LDE2NTUsMTcwNl0sWzE3NDEsMzQ0LDE2ODddLFsxNjg1LDE2OTEsMTY4NF0sWzE2ODQsMTY5MSw4MDJdLFsxNjcyLDE2NTYsMF0sWzEwMzgsMTI0LDYwOF0sWzE2NzEsMTY3MiwxNjkwXSxbMTYyOCwxMjE4LDE3NjddLFsxNjg2LDEyNzUsMTY2N10sWzE0OTMsMTc1MCwxNjgxXSxbMTc3MywxOCwxNzUwXSxbMTc3MywxNjYwLDE4XSxbMTY3OSwxNjcxLDE2XSxbMTczNSwxNzA2LDE2NzNdLFsxNjY3LDE2NzgsMTY4Nl0sWzE2ODgsMTY1OCwxXSxbMTY1NiwxNjg4LDBdLFsxMjkzLDEyODEsMTQ1OF0sWzE2OTgsMTY3OCwxNjY3XSxbMTY5NiwxMTMwLDE3MjJdLFsxNjk4LDE2NjcsMTY5Nl0sWzE3MTUsMTY2MiwxNjk5XSxbMTY5MiwxMDM4LDI5NF0sWzE2ODIsNzY3LDM1N10sWzE2NjksNjYxLDE2OTJdLFs4MDIsMTcwMiw4MjRdLFsxMDI4LDEwNjcsMTc4NF0sWzgyMiwxNjI0LDc3OF0sWzExOSw4MTMsODYxXSxbMTIxOCwxNjcwLDE2NzddLFsxNzAzLDE2OTMsMTddLFsxNjU4LDE3MTAsMV0sWzc1MCwxNzMwLDE3MjldLFsxNzAxLDc1MCwxNzI5XSxbMTY5MywxNzM1LDE2NzNdLFsxNzMxLDE2OTQsOThdLFsxNjkxLDE3MDIsODAyXSxbNzgzLDE3MjksMTcxOV0sWzE2ODAsODcwLDE3MDhdLFsxNzA3LDE3MDksMTY1NV0sWzUzMyw3NTYsNjc1XSxbMTY5MSwxMjEwLDE3MDJdLFsxMSwxNzA1LDE2NzBdLFsxNzY3LDEyMTgsMTE5Nl0sWzEyMTgsMTY3NywxMTk2XSxbMTY2NCwxNzE2LDE3MjFdLFsxNzI5LDE3MjUsMTcxOV0sWzE3MjksMTA3MiwxNzI1XSxbMTIxMCwxMTE2LDE3MDJdLFsxNzAyLDE3MjAsODI0XSxbMTY4MiwxNjYxLDJdLFsxNzEzLDE3MTksMTcyMV0sWzE3MTYsMTc4NiwxNzEzXSxbMTczMCwxNzIyLDEwNzJdLFsyOTQsMTcxNywxODExXSxbMTY5MiwyOTQsMTY2Nl0sWzE2NTksNjgwLDgyMV0sWzgyNCwxNzIwLDE3MTRdLFsxNzI2LDE3MzEsMTcxOF0sWzM0NSwxMDYyLDEwNDVdLFsxNzM4LDE3NDMsMTI3NV0sWzEwNzUsMTA4OSwxMDcxXSxbNzgzLDE3MTksMTY4OV0sWzEyNzUsNjg0LDE3MjhdLFsxNjkyLDE2NjYsMTY2NV0sWzE2NzUsMTY5MiwxNjY1XSxbMjk0LDE4MTEsMTY2Nl0sWzE3MTYsMTY2NCwzMTBdLFsxNjc4LDE2OTgsMTcwMF0sWzYsOSwxNzI3XSxbNjc2LDY0OSw1OTVdLFszODEsMzEsMzYxXSxbMTcyMywxODA0LDE3NzJdLFsxNzI3LDksMTY5NF0sWzE3MjAsMTA4OSwxNzE0XSxbMTc4NiwxNzE2LDE0MTJdLFsxNjgzLDExOTYsMTY4Nl0sWzE3MTgsMTY5NywxMDg1XSxbMTExNiwxNzM5LDE3MDJdLFsxNzM5LDE3MzQsMTcyMF0sWzE3MDIsMTczOSwxNzIwXSxbMTA4OSwxNzIwLDE3MzRdLFs1MDksNzQ4LDE3NDVdLFsxNzQzLDE3MTUsMTcyNl0sWzE3MTcsMjk0LDc5NF0sWzExMTYsMTczMiwxNzM5XSxbMTcxOCwxNzMxLDE2OTddLFsxNjk2LDE2NjcsMTEzMF0sWzExMzQsMTY2NSwxNzIzXSxbMTY5NCw3MTIsOThdLFsxMDEsMTY4NywxMDJdLFszOTEsMTczNiwxMDFdLFs2NjIsNjM2LDY0Ml0sWzE3MzQsMTQ0NywxMDg5XSxbMTA4OSwxNDQ3LDEwNzFdLFs0MzYsOTksNDkzXSxbMTY4OSwxMjc5LDc4M10sWzE0ODUsMTQ2NSwxMzQyXSxbMTczNiwxNjg3LDEwMV0sWzM0NCwxNzQxLDE3MzNdLFsxNzQxLDE3NDIsMTczM10sWzE3MzUsODI5LDE3MDZdLFs4MjksMTcwNywxNzA2XSxbMTQ4NSwxMzMyLDE0NjVdLFs5NTIsMTEyNiwxNzQyXSxbMTc0NywxNDQ3LDE3MzRdLFs4NzksODkyLDY0NV0sWzE3MzAsMTE0NiwxNjk2XSxbODI5LDE3MDksMTcwN10sWzE3MDksMTcxMiwxNjU1XSxbMTE4LDE3MzksMTczMl0sWzEzMzIsMTc0NCwxNDY1XSxbMTY4NywxNzQ5LDE3NDFdLFsxNzQxLDE3NTgsMTc0Ml0sWzY3OSwxMDcyLDY4XSxbMTA3MiwxNzIyLDY4XSxbMTE4LDE3NDcsMTczOV0sWzE3NDcsMTczNCwxNzM5XSxbMTQ2NSwxNzQ0LDE3MzZdLFsxNzM2LDE3NDAsMTY4N10sWzE3MDQsMTcwMSw3ODNdLFsxNjY1LDYyNCwxNzIzXSxbMTcyMiwxMTMwLDY3XSxbMTAyNSwxMDU1LDQ2N10sWzE0NDQsMTQsMTcwMV0sWzU1OCw1MjIsNTMwXSxbMTY1NywxNjU4LDE2ODhdLFsxMzM5LDE3NDYsMTMzMl0sWzEzMzIsMTc0OCwxNzQ0XSxbMTY4NywxNzQwLDE3NDldLFsxNzQxLDE3NDksMTc1OF0sWzExMDksOTUyLDE3NDJdLFsxNzQ3LDExOCwxNDFdLFsxNjcxLDE2OTAsMTYyOF0sWzE2NzEsMTYyOCwxNl0sWzE2NTcsMTY4OCwxNjU2XSxbMTc0NSw3NDgsMTQ0N10sWzM1Nyw3NjcsMTcxMF0sWzE3NDYsMTc0OCwxMzMyXSxbMTE0NiwxNzAwLDE2OThdLFsxNzU5LDEzMDcsMTMzOF0sWzEyMzksNzgxLDEzMjJdLFsxNzQ1LDE0NDcsMTc0N10sWzUyMiwxNzQ1LDE3NDddLFszMTYsNzE3LDU5NV0sWzE0OCwxNDkzLDE3MjRdLFsxNzU4LDExMDksMTc0Ml0sWzE3MjUsMTA3Miw2NzldLFs3MjYsNzE5LDE2NjFdLFsxNjk1LDE2ODAsMTUyNl0sWzE3NzIsMTc1MCwxNDkzXSxbMTQ4LDE3NzIsMTQ5M10sWzE1NDIsMTc1MSwxMTAxXSxbOTUyLDExMDksMTA4Nl0sWzE3NDQsMTc1MiwxNzM2XSxbMTczNiwxNzUyLDE3NDBdLFsxNzUzLDE3NTUsMTc0MF0sWzM5MSwxMzQyLDE3MzZdLFs4MjEsMTEyLDE1MjBdLFs1NTcsNTMwLDE3NDddLFs1MzAsNTIyLDE3NDddLFs5OTQsODc5LDY0NV0sWzE1NDIsMTc1NiwxNzUxXSxbMTgxMywxNjkzLDE3MDNdLFsxNzQ2LDE3NTQsMTc0OF0sWzE3NDgsMTc2NCwxNzQ0XSxbMTc1MiwxNzU3LDE3NDBdLFsxNzQwLDE3NTcsMTc1M10sWzE3NDksMTc0MCwxNzU1XSxbMTc1NSwxNzYzLDE3NDldLFsxNzYzLDE3NTgsMTc0OV0sWzEyNzUsMTc0Myw2ODRdLFsxODEzLDE3MzUsMTY5M10sWzExMDcsMTA5OSwxMTAxXSxbMTcyMyw2MjQsMTgwNF0sWzE0MDMsMTYwMywxNjA5XSxbMTc0OCwxNzU0LDE3NjRdLFsxNzQ0LDE3NTcsMTc1Ml0sWzE3NjAsMTEwOSwxNzU4XSxbMTQ2NSwxNzM2LDEzNDJdLFs0MzYsMTE1LDk5XSxbMTY4NiwxNzM4LDEyNzVdLFsxNzUxLDE3NjYsMTEwMV0sWzE3NTksMTc1NCwxNzQ2XSxbMTc1NSwxNzUzLDE3NjNdLFsxNTcwLDEyNzksODUzXSxbMTcwMSwxMTQ2LDc1MF0sWzE2NTUsMTY1NiwxNjcxXSxbMTEsMTY3MCwxMjE4XSxbMTc2MSwxNzUxLDE3NTZdLFsxNzY2LDExMDcsMTEwMV0sWzE3MjYsMTYyMywxNzMxXSxbMTcxMSwxNzA0LDEyNzldLFs2Nyw3ODQsNjhdLFs1NTgsNTMwLDU0NV0sWzE2MjAsMTYxOCwxMjMzXSxbMTc2OSwxNzYxLDE3NTZdLFsxMDIsMTY4NywzNDRdLFsxMzM4LDE3NTQsMTc1OV0sWzE3NTQsMjMyLDE3NjRdLFsxNzQ0LDE3NjUsMTc1N10sWzE3NTcsMTc2MywxNzUzXSxbMTc2MiwxNzYwLDE3NThdLFsxNzYwLDE3NzEsMTEwOV0sWzEzMzksMTc1OSwxNzQ2XSxbMTY3NSwxNjY1LDExMzRdLFsxNzMwLDE2OTYsMTcyMl0sWzE3NzQsMTc1MSwxNzYxXSxbMTc2NiwxNzgwLDExMDddLFsxNzgwLDExMDUsMTEwN10sWzE3NjQsMTc2NSwxNzQ0XSxbMTc2MywxNzYyLDE3NThdLFsxNzcyLDE3NzMsMTc1MF0sWzE4MTEsMTgxMywxNzAzXSxbMTQzNCwxNzY5LDE0MzJdLFsxNzgwLDE3NjYsMTc1MV0sWzIzMiwxNzgxLDE3NjRdLFsxNzExLDEyNzksMTU3MF0sWzE2ODgsMSwwXSxbMTc3NCwxNzgwLDE3NTFdLFsxNzY0LDE3ODEsMTc2NV0sWzE3NjUsMTc2OCwxNzU3XSxbMTc1NywxNzY4LDE3NjNdLFsxNzc3LDE3ODIsMTc2MF0sWzE3NjIsMTc3NywxNzYwXSxbMTc2OSwxNzc0LDE3NjFdLFsxNzYzLDE3NzcsMTc2Ml0sWzE3NjAsMTc4MiwxNzcxXSxbMjMyLDE3MzcsMTc4MV0sWzE3NjgsMTc3NiwxNzYzXSxbMjcyLDI1NSw3NzRdLFsxNjY5LDk5NCw2NjFdLFsxNjE4LDE3NjksMTQzNF0sWzE3NjUsNTg5LDE3NjhdLFsxNzcwLDE3NzcsMTc2M10sWzE3MDEsMTcyOSw3ODNdLFsxNzgzLDE3NzQsMTc2OV0sWzE3ODksMTc4MCwxNzc0XSxbNTg5LDE3NzUsMTc2OF0sWzE3NzYsMTc3MCwxNzYzXSxbMTc4MiwxNzc4LDE3NzFdLFsxNzcxLDE3NzgsMTA3MF0sWzYyNCwxNzAzLDE3NzNdLFs2MjQsMTgxMSwxNzAzXSxbMTYyMCwxMjQ0LDE2MThdLFsxNzc5LDE3NjksMTYxOF0sWzE3NzksMTc4MywxNzY5XSxbNzM5LDE3MzUsMTgxM10sWzE3NzUsMTc3NiwxNzY4XSxbMTc5MCwxNzc3LDE3NzBdLFsxNzc3LDE3NzgsMTc4Ml0sWzE3MjUsNjc5LDE3MjFdLFs3MzMsMTI5MywxNDU4XSxbMTgwMiwxNjE4LDEyNDRdLFsxODAyLDE3NzksMTYxOF0sWzE3ODgsMTc4MywxNzc5XSxbMTc4OSwxNzc0LDE3ODNdLFsxNzk2LDE3ODAsMTc4OV0sWzE3OTYsMTExOSwxNzgwXSxbMTgyMywxODE3LDMyNV0sWzE2OTksMTcyNywxNjIzXSxbNzUwLDExNDYsMTczMF0sWzE0OTcsMTcyNCwyOTZdLFsxMTI4LDExMTksMTc5Nl0sWzYxLDYyLDcxXSxbMTEzMSw0MTMsODI0XSxbMTExNCwxMTExLDI0OV0sWzE3ODQsMTc3NiwxNzc1XSxbMTEyMyw3MjMsMTI4M10sWzE3OTEsMTc4OCwxNzc5XSxbMTc4OCwxNzg5LDE3ODNdLFsxMDk1LDE3OTcsMTA3NF0sWzEwMjgsMTc4NCwxNzc1XSxbMTc4NCwxNzcwLDE3NzZdLFsxNzc3LDE3OTAsMTc3OF0sWzE3OTMsMTc5NywxMDk1XSxbMTc5NywxODAwLDEwNzRdLFsxNzk4LDE3OTAsMTc3MF0sWzE4MDUsMTgwMiwxMjQ0XSxbMTgwMiwxNzkxLDE3NzldLFsxNzkyLDE3ODksMTc4OF0sWzE3OTMsMTc4NSwxMTI4XSxbMTc5MywxMDk1LDE3ODVdLFsxMDc0LDE4MDAsMTYxOV0sWzc0MSw0NTcsNTkzXSxbMTc5OCwxNzcwLDE3ODRdLFsxNzk4LDE3OTQsMTc5MF0sWzE3ODYsMTY4OSwxNzEzXSxbNjg0LDE3MjYsMTcxOF0sWzE3MjgsMTA4NSw3OTNdLFsxNzk1LDE3ODcsMTUwMl0sWzE4MDYsMTgwMiwxODA1XSxbMTgxOSwxNzg4LDE3OTFdLFsxMDY3LDE3OTgsMTc4NF0sWzE3OTAsMTc5NCwxNzc4XSxbMTc5NSwxNTAyLDExMjRdLFsxODAxLDE4MDUsMTc4N10sWzE4MDcsMTc5MSwxODAyXSxbMTgwNywxODE5LDE3OTFdLFsxODE5LDE3OTIsMTc4OF0sWzE3OTksMTEyOCwxNzk2XSxbOTk0LDY0NSw2NjFdLFs2ODQsMTA4NSwxNzI4XSxbNjg0LDE3MTgsMTA4NV0sWzE2OTksMTYyMywxNzI2XSxbMTgwMSwxNzg3LDE3OTVdLFsxODA4LDE3ODksMTc5Ml0sWzE4MDgsMTc5NiwxNzg5XSxbMTc5OSwxNzkzLDExMjhdLFsxODA5LDE3OTcsMTc5M10sWzE4MDksMTgwMywxNzk3XSxbMTgwMywxODAwLDE3OTddLFsxMDY3LDE3OTQsMTc5OF0sWzc3NCwyNTUsMTc3OF0sWzE2NzMsMTY3MSwxNjc5XSxbODc5LDE2NjksODg4XSxbMTksMTgwNywxODAyXSxbMTgxMCwxNjE5LDE4MDBdLFs4NzksOTk0LDE2NjldLFsxNzk0LDc3NCwxNzc4XSxbMTcyMywxNzcyLDE0OF0sWzE4MDQsMTc3MywxNzcyXSxbMTgxNCwxNzk1LDExMjRdLFsxNjQ5LDE4MTQsMTEyNF0sWzE4MTQsMTgwMSwxNzk1XSxbMTgxMiwxODA2LDE4MDVdLFsxOSwxODAyLDE4MDZdLFsxOSwxODE5LDE4MDddLFsxODEwLDE4MDAsMTgwM10sWzE4MDQsNjI0LDE3NzNdLFsxNzE0LDExMzEsODI0XSxbMTgwMSwxODEyLDE4MDVdLFsxODEyLDE5LDE4MDZdLFsxODA4LDE3OTIsMTgxOV0sWzE3OTksMTgwOSwxNzkzXSxbMTgyMSwxODEwLDE4MDNdLFsxNzE3LDczOSwxODEzXSxbMTA2MSwxNjE5LDE4MjJdLFsxNzk0LDE4MTcsNzc0XSxbNzksMTQ4MiwxNDRdLFsxODE1LDE4MDEsMTgxNF0sWzIzLDE4MTksMTldLFs1ODksMTAyOCwxNzc1XSxbMTgxNywxODIzLDc3NF0sWzE2ODksMTcxOSwxNzEzXSxbMTgyNCwxODE0LDE2NDldLFsxODI3LDE4MTgsMTgwMV0sWzE4MTgsMTgxMiwxODAxXSxbMTgxOCwxOSwxODEyXSxbMTgxOCwyMCwxOV0sWzE4MTYsMTgwOSwxNzk5XSxbMTgyMSwxODAzLDE4MDldLFsxODIyLDE2MTksMTgxMF0sWzEyNCw3MDgsNjA4XSxbMTY2MywxMCwxNzE1XSxbMTgxNSwxODI3LDE4MDFdLFsxODIwLDE4MDgsMTgxOV0sWzIzLDE4MjAsMTgxOV0sWzYwMywxODEwLDE4MjFdLFs2MDMsMTgyMiwxODEwXSxbMTA4NSwxNjk3LDc5M10sWzE2MjgsMTY5MCwxMV0sWzE1MjcsMTcwNCwxNjI0XSxbMTczMCwxMDcyLDE3MjldLFsxNTI2LDE0NDQsMTcwNF0sWzE1MjYsMTY4MCwxNDQ0XSxbMTcwNCwxNDQ0LDE3MDFdLFsxODE2LDE4MjEsMTgwOV0sWzE3MjIsNjcsNjhdLFszMTcsMjcyLDE4MjNdLFsxNzE2LDE3MTMsMTcyMV0sWzE2LDE2MjgsMTc2N10sWzE1MjcsMTUyNiwxNzA0XSxbMTgyNCwxODI2LDE4MTRdLFsxODE0LDE4MjYsMTgxNV0sWzE4MTgsMjEsMjBdLFsxODM1LDE4MDgsMTgyMF0sWzYwMyw1NzAsMTgyMl0sWzIyNiwxMDcwLDE3NzhdLFsxMDEzLDExODEsMTE3OV0sWzE3MjEsNjc5LDE2NjRdLFsxNzE3LDE4MTMsMTgxMV0sWzE4MjgsMTgyNywxODE1XSxbMjIsMTgyMCwyM10sWzIyLDE4MzUsMTgyMF0sWzE4MzAsNjAzLDE4MjFdLFs3MTksMTY1OSw1XSxbNjQzLDU2NywxNjU3XSxbMTcxNyw3OTQsNzM5XSxbMTgyNSwxODI2LDE4MjRdLFsxODI4LDE4MTUsMTgyNl0sWzE4MjksMjEsMTgxOF0sWzE4MDgsMTgzNSwxM10sWzQsNzE5LDVdLFsxMCwxNjYyLDE3MTVdLFsxODI4LDE4MzIsMTgyN10sWzE4MzIsMTgxOCwxODI3XSxbMTIsMTgzMywxODE2XSxbMTgzMywxODIxLDE4MTZdLFsxODMzLDE4MzAsMTgyMV0sWzE0LDExNDYsMTcwMV0sWzExODYsMTgyOSwxODE4XSxbMTI4MCw2MDMsMTgzMF0sWzE0LDE3MDAsMTE0Nl0sWzE2NjcsMTcyOCwxMTMwXSxbMTgyNSwxODM0LDE4MjZdLFsxODM0LDE4MjgsMTgyNl0sWzE4MzIsMTE4NiwxODE4XSxbMTgzNiwxMywxODM1XSxbMTYyNCwxNzExLDE1NzBdLFs3NzgsMTYyNCwxNTcwXSxbMTcxOSwxNzI1LDE3MjFdLFsxMDAyLDE4MjUsMTgzMV0sWzEwMDIsMTgzNCwxODI1XSxbMTgzNCwxODMyLDE4MjhdLFsxMTg2LDIxLDE4MjldLFsxODM2LDE4MzUsMjJdLFsxODM3LDE4MzMsMTJdLFsxMjgwLDE4MzAsMTgzM10sWzE2NjcsMTI3NSwxNzI4XSxbMTYsMTc2NywxMDg0XSxbNTg5LDE3NjUsMTgzOF0sWzE3NjUsMTc4MSwxODM4XSxbMTc4MSwxNzM3LDE4MzhdLFsxNzM3LDk4MiwxODM4XSxbOTgyLDEwNTMsMTgzOF0sWzEwNTMsODE2LDE4MzhdLFs4MTYsNTg5LDE4MzhdXVxuIiwibW9kdWxlLmV4cG9ydHMgPSBhZGpvaW50O1xuXG4vKipcbiAqIENhbGN1bGF0ZXMgdGhlIGFkanVnYXRlIG9mIGEgbWF0NFxuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDR9IGEgdGhlIHNvdXJjZSBtYXRyaXhcbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xuZnVuY3Rpb24gYWRqb2ludChvdXQsIGEpIHtcbiAgICB2YXIgYTAwID0gYVswXSwgYTAxID0gYVsxXSwgYTAyID0gYVsyXSwgYTAzID0gYVszXSxcbiAgICAgICAgYTEwID0gYVs0XSwgYTExID0gYVs1XSwgYTEyID0gYVs2XSwgYTEzID0gYVs3XSxcbiAgICAgICAgYTIwID0gYVs4XSwgYTIxID0gYVs5XSwgYTIyID0gYVsxMF0sIGEyMyA9IGFbMTFdLFxuICAgICAgICBhMzAgPSBhWzEyXSwgYTMxID0gYVsxM10sIGEzMiA9IGFbMTRdLCBhMzMgPSBhWzE1XTtcblxuICAgIG91dFswXSAgPSAgKGExMSAqIChhMjIgKiBhMzMgLSBhMjMgKiBhMzIpIC0gYTIxICogKGExMiAqIGEzMyAtIGExMyAqIGEzMikgKyBhMzEgKiAoYTEyICogYTIzIC0gYTEzICogYTIyKSk7XG4gICAgb3V0WzFdICA9IC0oYTAxICogKGEyMiAqIGEzMyAtIGEyMyAqIGEzMikgLSBhMjEgKiAoYTAyICogYTMzIC0gYTAzICogYTMyKSArIGEzMSAqIChhMDIgKiBhMjMgLSBhMDMgKiBhMjIpKTtcbiAgICBvdXRbMl0gID0gIChhMDEgKiAoYTEyICogYTMzIC0gYTEzICogYTMyKSAtIGExMSAqIChhMDIgKiBhMzMgLSBhMDMgKiBhMzIpICsgYTMxICogKGEwMiAqIGExMyAtIGEwMyAqIGExMikpO1xuICAgIG91dFszXSAgPSAtKGEwMSAqIChhMTIgKiBhMjMgLSBhMTMgKiBhMjIpIC0gYTExICogKGEwMiAqIGEyMyAtIGEwMyAqIGEyMikgKyBhMjEgKiAoYTAyICogYTEzIC0gYTAzICogYTEyKSk7XG4gICAgb3V0WzRdICA9IC0oYTEwICogKGEyMiAqIGEzMyAtIGEyMyAqIGEzMikgLSBhMjAgKiAoYTEyICogYTMzIC0gYTEzICogYTMyKSArIGEzMCAqIChhMTIgKiBhMjMgLSBhMTMgKiBhMjIpKTtcbiAgICBvdXRbNV0gID0gIChhMDAgKiAoYTIyICogYTMzIC0gYTIzICogYTMyKSAtIGEyMCAqIChhMDIgKiBhMzMgLSBhMDMgKiBhMzIpICsgYTMwICogKGEwMiAqIGEyMyAtIGEwMyAqIGEyMikpO1xuICAgIG91dFs2XSAgPSAtKGEwMCAqIChhMTIgKiBhMzMgLSBhMTMgKiBhMzIpIC0gYTEwICogKGEwMiAqIGEzMyAtIGEwMyAqIGEzMikgKyBhMzAgKiAoYTAyICogYTEzIC0gYTAzICogYTEyKSk7XG4gICAgb3V0WzddICA9ICAoYTAwICogKGExMiAqIGEyMyAtIGExMyAqIGEyMikgLSBhMTAgKiAoYTAyICogYTIzIC0gYTAzICogYTIyKSArIGEyMCAqIChhMDIgKiBhMTMgLSBhMDMgKiBhMTIpKTtcbiAgICBvdXRbOF0gID0gIChhMTAgKiAoYTIxICogYTMzIC0gYTIzICogYTMxKSAtIGEyMCAqIChhMTEgKiBhMzMgLSBhMTMgKiBhMzEpICsgYTMwICogKGExMSAqIGEyMyAtIGExMyAqIGEyMSkpO1xuICAgIG91dFs5XSAgPSAtKGEwMCAqIChhMjEgKiBhMzMgLSBhMjMgKiBhMzEpIC0gYTIwICogKGEwMSAqIGEzMyAtIGEwMyAqIGEzMSkgKyBhMzAgKiAoYTAxICogYTIzIC0gYTAzICogYTIxKSk7XG4gICAgb3V0WzEwXSA9ICAoYTAwICogKGExMSAqIGEzMyAtIGExMyAqIGEzMSkgLSBhMTAgKiAoYTAxICogYTMzIC0gYTAzICogYTMxKSArIGEzMCAqIChhMDEgKiBhMTMgLSBhMDMgKiBhMTEpKTtcbiAgICBvdXRbMTFdID0gLShhMDAgKiAoYTExICogYTIzIC0gYTEzICogYTIxKSAtIGExMCAqIChhMDEgKiBhMjMgLSBhMDMgKiBhMjEpICsgYTIwICogKGEwMSAqIGExMyAtIGEwMyAqIGExMSkpO1xuICAgIG91dFsxMl0gPSAtKGExMCAqIChhMjEgKiBhMzIgLSBhMjIgKiBhMzEpIC0gYTIwICogKGExMSAqIGEzMiAtIGExMiAqIGEzMSkgKyBhMzAgKiAoYTExICogYTIyIC0gYTEyICogYTIxKSk7XG4gICAgb3V0WzEzXSA9ICAoYTAwICogKGEyMSAqIGEzMiAtIGEyMiAqIGEzMSkgLSBhMjAgKiAoYTAxICogYTMyIC0gYTAyICogYTMxKSArIGEzMCAqIChhMDEgKiBhMjIgLSBhMDIgKiBhMjEpKTtcbiAgICBvdXRbMTRdID0gLShhMDAgKiAoYTExICogYTMyIC0gYTEyICogYTMxKSAtIGExMCAqIChhMDEgKiBhMzIgLSBhMDIgKiBhMzEpICsgYTMwICogKGEwMSAqIGExMiAtIGEwMiAqIGExMSkpO1xuICAgIG91dFsxNV0gPSAgKGEwMCAqIChhMTEgKiBhMjIgLSBhMTIgKiBhMjEpIC0gYTEwICogKGEwMSAqIGEyMiAtIGEwMiAqIGEyMSkgKyBhMjAgKiAoYTAxICogYTEyIC0gYTAyICogYTExKSk7XG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSBjbG9uZTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IG1hdDQgaW5pdGlhbGl6ZWQgd2l0aCB2YWx1ZXMgZnJvbSBhbiBleGlzdGluZyBtYXRyaXhcbiAqXG4gKiBAcGFyYW0ge21hdDR9IGEgbWF0cml4IHRvIGNsb25lXG4gKiBAcmV0dXJucyB7bWF0NH0gYSBuZXcgNHg0IG1hdHJpeFxuICovXG5mdW5jdGlvbiBjbG9uZShhKSB7XG4gICAgdmFyIG91dCA9IG5ldyBGbG9hdDMyQXJyYXkoMTYpO1xuICAgIG91dFswXSA9IGFbMF07XG4gICAgb3V0WzFdID0gYVsxXTtcbiAgICBvdXRbMl0gPSBhWzJdO1xuICAgIG91dFszXSA9IGFbM107XG4gICAgb3V0WzRdID0gYVs0XTtcbiAgICBvdXRbNV0gPSBhWzVdO1xuICAgIG91dFs2XSA9IGFbNl07XG4gICAgb3V0WzddID0gYVs3XTtcbiAgICBvdXRbOF0gPSBhWzhdO1xuICAgIG91dFs5XSA9IGFbOV07XG4gICAgb3V0WzEwXSA9IGFbMTBdO1xuICAgIG91dFsxMV0gPSBhWzExXTtcbiAgICBvdXRbMTJdID0gYVsxMl07XG4gICAgb3V0WzEzXSA9IGFbMTNdO1xuICAgIG91dFsxNF0gPSBhWzE0XTtcbiAgICBvdXRbMTVdID0gYVsxNV07XG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSBjb3B5O1xuXG4vKipcbiAqIENvcHkgdGhlIHZhbHVlcyBmcm9tIG9uZSBtYXQ0IHRvIGFub3RoZXJcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQ0fSBhIHRoZSBzb3VyY2UgbWF0cml4XG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbmZ1bmN0aW9uIGNvcHkob3V0LCBhKSB7XG4gICAgb3V0WzBdID0gYVswXTtcbiAgICBvdXRbMV0gPSBhWzFdO1xuICAgIG91dFsyXSA9IGFbMl07XG4gICAgb3V0WzNdID0gYVszXTtcbiAgICBvdXRbNF0gPSBhWzRdO1xuICAgIG91dFs1XSA9IGFbNV07XG4gICAgb3V0WzZdID0gYVs2XTtcbiAgICBvdXRbN10gPSBhWzddO1xuICAgIG91dFs4XSA9IGFbOF07XG4gICAgb3V0WzldID0gYVs5XTtcbiAgICBvdXRbMTBdID0gYVsxMF07XG4gICAgb3V0WzExXSA9IGFbMTFdO1xuICAgIG91dFsxMl0gPSBhWzEyXTtcbiAgICBvdXRbMTNdID0gYVsxM107XG4gICAgb3V0WzE0XSA9IGFbMTRdO1xuICAgIG91dFsxNV0gPSBhWzE1XTtcbiAgICByZXR1cm4gb3V0O1xufTsiLCJtb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IGlkZW50aXR5IG1hdDRcbiAqXG4gKiBAcmV0dXJucyB7bWF0NH0gYSBuZXcgNHg0IG1hdHJpeFxuICovXG5mdW5jdGlvbiBjcmVhdGUoKSB7XG4gICAgdmFyIG91dCA9IG5ldyBGbG9hdDMyQXJyYXkoMTYpO1xuICAgIG91dFswXSA9IDE7XG4gICAgb3V0WzFdID0gMDtcbiAgICBvdXRbMl0gPSAwO1xuICAgIG91dFszXSA9IDA7XG4gICAgb3V0WzRdID0gMDtcbiAgICBvdXRbNV0gPSAxO1xuICAgIG91dFs2XSA9IDA7XG4gICAgb3V0WzddID0gMDtcbiAgICBvdXRbOF0gPSAwO1xuICAgIG91dFs5XSA9IDA7XG4gICAgb3V0WzEwXSA9IDE7XG4gICAgb3V0WzExXSA9IDA7XG4gICAgb3V0WzEyXSA9IDA7XG4gICAgb3V0WzEzXSA9IDA7XG4gICAgb3V0WzE0XSA9IDA7XG4gICAgb3V0WzE1XSA9IDE7XG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSBkZXRlcm1pbmFudDtcblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBkZXRlcm1pbmFudCBvZiBhIG1hdDRcbiAqXG4gKiBAcGFyYW0ge21hdDR9IGEgdGhlIHNvdXJjZSBtYXRyaXhcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IGRldGVybWluYW50IG9mIGFcbiAqL1xuZnVuY3Rpb24gZGV0ZXJtaW5hbnQoYSkge1xuICAgIHZhciBhMDAgPSBhWzBdLCBhMDEgPSBhWzFdLCBhMDIgPSBhWzJdLCBhMDMgPSBhWzNdLFxuICAgICAgICBhMTAgPSBhWzRdLCBhMTEgPSBhWzVdLCBhMTIgPSBhWzZdLCBhMTMgPSBhWzddLFxuICAgICAgICBhMjAgPSBhWzhdLCBhMjEgPSBhWzldLCBhMjIgPSBhWzEwXSwgYTIzID0gYVsxMV0sXG4gICAgICAgIGEzMCA9IGFbMTJdLCBhMzEgPSBhWzEzXSwgYTMyID0gYVsxNF0sIGEzMyA9IGFbMTVdLFxuXG4gICAgICAgIGIwMCA9IGEwMCAqIGExMSAtIGEwMSAqIGExMCxcbiAgICAgICAgYjAxID0gYTAwICogYTEyIC0gYTAyICogYTEwLFxuICAgICAgICBiMDIgPSBhMDAgKiBhMTMgLSBhMDMgKiBhMTAsXG4gICAgICAgIGIwMyA9IGEwMSAqIGExMiAtIGEwMiAqIGExMSxcbiAgICAgICAgYjA0ID0gYTAxICogYTEzIC0gYTAzICogYTExLFxuICAgICAgICBiMDUgPSBhMDIgKiBhMTMgLSBhMDMgKiBhMTIsXG4gICAgICAgIGIwNiA9IGEyMCAqIGEzMSAtIGEyMSAqIGEzMCxcbiAgICAgICAgYjA3ID0gYTIwICogYTMyIC0gYTIyICogYTMwLFxuICAgICAgICBiMDggPSBhMjAgKiBhMzMgLSBhMjMgKiBhMzAsXG4gICAgICAgIGIwOSA9IGEyMSAqIGEzMiAtIGEyMiAqIGEzMSxcbiAgICAgICAgYjEwID0gYTIxICogYTMzIC0gYTIzICogYTMxLFxuICAgICAgICBiMTEgPSBhMjIgKiBhMzMgLSBhMjMgKiBhMzI7XG5cbiAgICAvLyBDYWxjdWxhdGUgdGhlIGRldGVybWluYW50XG4gICAgcmV0dXJuIGIwMCAqIGIxMSAtIGIwMSAqIGIxMCArIGIwMiAqIGIwOSArIGIwMyAqIGIwOCAtIGIwNCAqIGIwNyArIGIwNSAqIGIwNjtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSBmcm9tUXVhdDtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbWF0cml4IGZyb20gYSBxdWF0ZXJuaW9uIHJvdGF0aW9uLlxuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IG1hdDQgcmVjZWl2aW5nIG9wZXJhdGlvbiByZXN1bHRcbiAqIEBwYXJhbSB7cXVhdDR9IHEgUm90YXRpb24gcXVhdGVybmlvblxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5mdW5jdGlvbiBmcm9tUXVhdChvdXQsIHEpIHtcbiAgICB2YXIgeCA9IHFbMF0sIHkgPSBxWzFdLCB6ID0gcVsyXSwgdyA9IHFbM10sXG4gICAgICAgIHgyID0geCArIHgsXG4gICAgICAgIHkyID0geSArIHksXG4gICAgICAgIHoyID0geiArIHosXG5cbiAgICAgICAgeHggPSB4ICogeDIsXG4gICAgICAgIHl4ID0geSAqIHgyLFxuICAgICAgICB5eSA9IHkgKiB5MixcbiAgICAgICAgenggPSB6ICogeDIsXG4gICAgICAgIHp5ID0geiAqIHkyLFxuICAgICAgICB6eiA9IHogKiB6MixcbiAgICAgICAgd3ggPSB3ICogeDIsXG4gICAgICAgIHd5ID0gdyAqIHkyLFxuICAgICAgICB3eiA9IHcgKiB6MjtcblxuICAgIG91dFswXSA9IDEgLSB5eSAtIHp6O1xuICAgIG91dFsxXSA9IHl4ICsgd3o7XG4gICAgb3V0WzJdID0genggLSB3eTtcbiAgICBvdXRbM10gPSAwO1xuXG4gICAgb3V0WzRdID0geXggLSB3ejtcbiAgICBvdXRbNV0gPSAxIC0geHggLSB6ejtcbiAgICBvdXRbNl0gPSB6eSArIHd4O1xuICAgIG91dFs3XSA9IDA7XG5cbiAgICBvdXRbOF0gPSB6eCArIHd5O1xuICAgIG91dFs5XSA9IHp5IC0gd3g7XG4gICAgb3V0WzEwXSA9IDEgLSB4eCAtIHl5O1xuICAgIG91dFsxMV0gPSAwO1xuXG4gICAgb3V0WzEyXSA9IDA7XG4gICAgb3V0WzEzXSA9IDA7XG4gICAgb3V0WzE0XSA9IDA7XG4gICAgb3V0WzE1XSA9IDE7XG5cbiAgICByZXR1cm4gb3V0O1xufTsiLCJtb2R1bGUuZXhwb3J0cyA9IGZyb21Sb3RhdGlvblRyYW5zbGF0aW9uO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBtYXRyaXggZnJvbSBhIHF1YXRlcm5pb24gcm90YXRpb24gYW5kIHZlY3RvciB0cmFuc2xhdGlvblxuICogVGhpcyBpcyBlcXVpdmFsZW50IHRvIChidXQgbXVjaCBmYXN0ZXIgdGhhbik6XG4gKlxuICogICAgIG1hdDQuaWRlbnRpdHkoZGVzdCk7XG4gKiAgICAgbWF0NC50cmFuc2xhdGUoZGVzdCwgdmVjKTtcbiAqICAgICB2YXIgcXVhdE1hdCA9IG1hdDQuY3JlYXRlKCk7XG4gKiAgICAgcXVhdDQudG9NYXQ0KHF1YXQsIHF1YXRNYXQpO1xuICogICAgIG1hdDQubXVsdGlwbHkoZGVzdCwgcXVhdE1hdCk7XG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgbWF0NCByZWNlaXZpbmcgb3BlcmF0aW9uIHJlc3VsdFxuICogQHBhcmFtIHtxdWF0NH0gcSBSb3RhdGlvbiBxdWF0ZXJuaW9uXG4gKiBAcGFyYW0ge3ZlYzN9IHYgVHJhbnNsYXRpb24gdmVjdG9yXG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbmZ1bmN0aW9uIGZyb21Sb3RhdGlvblRyYW5zbGF0aW9uKG91dCwgcSwgdikge1xuICAgIC8vIFF1YXRlcm5pb24gbWF0aFxuICAgIHZhciB4ID0gcVswXSwgeSA9IHFbMV0sIHogPSBxWzJdLCB3ID0gcVszXSxcbiAgICAgICAgeDIgPSB4ICsgeCxcbiAgICAgICAgeTIgPSB5ICsgeSxcbiAgICAgICAgejIgPSB6ICsgeixcblxuICAgICAgICB4eCA9IHggKiB4MixcbiAgICAgICAgeHkgPSB4ICogeTIsXG4gICAgICAgIHh6ID0geCAqIHoyLFxuICAgICAgICB5eSA9IHkgKiB5MixcbiAgICAgICAgeXogPSB5ICogejIsXG4gICAgICAgIHp6ID0geiAqIHoyLFxuICAgICAgICB3eCA9IHcgKiB4MixcbiAgICAgICAgd3kgPSB3ICogeTIsXG4gICAgICAgIHd6ID0gdyAqIHoyO1xuXG4gICAgb3V0WzBdID0gMSAtICh5eSArIHp6KTtcbiAgICBvdXRbMV0gPSB4eSArIHd6O1xuICAgIG91dFsyXSA9IHh6IC0gd3k7XG4gICAgb3V0WzNdID0gMDtcbiAgICBvdXRbNF0gPSB4eSAtIHd6O1xuICAgIG91dFs1XSA9IDEgLSAoeHggKyB6eik7XG4gICAgb3V0WzZdID0geXogKyB3eDtcbiAgICBvdXRbN10gPSAwO1xuICAgIG91dFs4XSA9IHh6ICsgd3k7XG4gICAgb3V0WzldID0geXogLSB3eDtcbiAgICBvdXRbMTBdID0gMSAtICh4eCArIHl5KTtcbiAgICBvdXRbMTFdID0gMDtcbiAgICBvdXRbMTJdID0gdlswXTtcbiAgICBvdXRbMTNdID0gdlsxXTtcbiAgICBvdXRbMTRdID0gdlsyXTtcbiAgICBvdXRbMTVdID0gMTtcbiAgICBcbiAgICByZXR1cm4gb3V0O1xufTsiLCJtb2R1bGUuZXhwb3J0cyA9IGZydXN0dW07XG5cbi8qKlxuICogR2VuZXJhdGVzIGEgZnJ1c3R1bSBtYXRyaXggd2l0aCB0aGUgZ2l2ZW4gYm91bmRzXG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgbWF0NCBmcnVzdHVtIG1hdHJpeCB3aWxsIGJlIHdyaXR0ZW4gaW50b1xuICogQHBhcmFtIHtOdW1iZXJ9IGxlZnQgTGVmdCBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHBhcmFtIHtOdW1iZXJ9IHJpZ2h0IFJpZ2h0IGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcGFyYW0ge051bWJlcn0gYm90dG9tIEJvdHRvbSBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHBhcmFtIHtOdW1iZXJ9IHRvcCBUb3AgYm91bmQgb2YgdGhlIGZydXN0dW1cbiAqIEBwYXJhbSB7TnVtYmVyfSBuZWFyIE5lYXIgYm91bmQgb2YgdGhlIGZydXN0dW1cbiAqIEBwYXJhbSB7TnVtYmVyfSBmYXIgRmFyIGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbmZ1bmN0aW9uIGZydXN0dW0ob3V0LCBsZWZ0LCByaWdodCwgYm90dG9tLCB0b3AsIG5lYXIsIGZhcikge1xuICAgIHZhciBybCA9IDEgLyAocmlnaHQgLSBsZWZ0KSxcbiAgICAgICAgdGIgPSAxIC8gKHRvcCAtIGJvdHRvbSksXG4gICAgICAgIG5mID0gMSAvIChuZWFyIC0gZmFyKTtcbiAgICBvdXRbMF0gPSAobmVhciAqIDIpICogcmw7XG4gICAgb3V0WzFdID0gMDtcbiAgICBvdXRbMl0gPSAwO1xuICAgIG91dFszXSA9IDA7XG4gICAgb3V0WzRdID0gMDtcbiAgICBvdXRbNV0gPSAobmVhciAqIDIpICogdGI7XG4gICAgb3V0WzZdID0gMDtcbiAgICBvdXRbN10gPSAwO1xuICAgIG91dFs4XSA9IChyaWdodCArIGxlZnQpICogcmw7XG4gICAgb3V0WzldID0gKHRvcCArIGJvdHRvbSkgKiB0YjtcbiAgICBvdXRbMTBdID0gKGZhciArIG5lYXIpICogbmY7XG4gICAgb3V0WzExXSA9IC0xO1xuICAgIG91dFsxMl0gPSAwO1xuICAgIG91dFsxM10gPSAwO1xuICAgIG91dFsxNF0gPSAoZmFyICogbmVhciAqIDIpICogbmY7XG4gICAgb3V0WzE1XSA9IDA7XG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSBpZGVudGl0eTtcblxuLyoqXG4gKiBTZXQgYSBtYXQ0IHRvIHRoZSBpZGVudGl0eSBtYXRyaXhcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5mdW5jdGlvbiBpZGVudGl0eShvdXQpIHtcbiAgICBvdXRbMF0gPSAxO1xuICAgIG91dFsxXSA9IDA7XG4gICAgb3V0WzJdID0gMDtcbiAgICBvdXRbM10gPSAwO1xuICAgIG91dFs0XSA9IDA7XG4gICAgb3V0WzVdID0gMTtcbiAgICBvdXRbNl0gPSAwO1xuICAgIG91dFs3XSA9IDA7XG4gICAgb3V0WzhdID0gMDtcbiAgICBvdXRbOV0gPSAwO1xuICAgIG91dFsxMF0gPSAxO1xuICAgIG91dFsxMV0gPSAwO1xuICAgIG91dFsxMl0gPSAwO1xuICAgIG91dFsxM10gPSAwO1xuICAgIG91dFsxNF0gPSAwO1xuICAgIG91dFsxNV0gPSAxO1xuICAgIHJldHVybiBvdXQ7XG59OyIsIm1vZHVsZS5leHBvcnRzID0ge1xuICBjcmVhdGU6IHJlcXVpcmUoJy4vY3JlYXRlJylcbiAgLCBjbG9uZTogcmVxdWlyZSgnLi9jbG9uZScpXG4gICwgY29weTogcmVxdWlyZSgnLi9jb3B5JylcbiAgLCBpZGVudGl0eTogcmVxdWlyZSgnLi9pZGVudGl0eScpXG4gICwgdHJhbnNwb3NlOiByZXF1aXJlKCcuL3RyYW5zcG9zZScpXG4gICwgaW52ZXJ0OiByZXF1aXJlKCcuL2ludmVydCcpXG4gICwgYWRqb2ludDogcmVxdWlyZSgnLi9hZGpvaW50JylcbiAgLCBkZXRlcm1pbmFudDogcmVxdWlyZSgnLi9kZXRlcm1pbmFudCcpXG4gICwgbXVsdGlwbHk6IHJlcXVpcmUoJy4vbXVsdGlwbHknKVxuICAsIHRyYW5zbGF0ZTogcmVxdWlyZSgnLi90cmFuc2xhdGUnKVxuICAsIHNjYWxlOiByZXF1aXJlKCcuL3NjYWxlJylcbiAgLCByb3RhdGU6IHJlcXVpcmUoJy4vcm90YXRlJylcbiAgLCByb3RhdGVYOiByZXF1aXJlKCcuL3JvdGF0ZVgnKVxuICAsIHJvdGF0ZVk6IHJlcXVpcmUoJy4vcm90YXRlWScpXG4gICwgcm90YXRlWjogcmVxdWlyZSgnLi9yb3RhdGVaJylcbiAgLCBmcm9tUm90YXRpb25UcmFuc2xhdGlvbjogcmVxdWlyZSgnLi9mcm9tUm90YXRpb25UcmFuc2xhdGlvbicpXG4gICwgZnJvbVF1YXQ6IHJlcXVpcmUoJy4vZnJvbVF1YXQnKVxuICAsIGZydXN0dW06IHJlcXVpcmUoJy4vZnJ1c3R1bScpXG4gICwgcGVyc3BlY3RpdmU6IHJlcXVpcmUoJy4vcGVyc3BlY3RpdmUnKVxuICAsIHBlcnNwZWN0aXZlRnJvbUZpZWxkT2ZWaWV3OiByZXF1aXJlKCcuL3BlcnNwZWN0aXZlRnJvbUZpZWxkT2ZWaWV3JylcbiAgLCBvcnRobzogcmVxdWlyZSgnLi9vcnRobycpXG4gICwgbG9va0F0OiByZXF1aXJlKCcuL2xvb2tBdCcpXG4gICwgc3RyOiByZXF1aXJlKCcuL3N0cicpXG59IiwibW9kdWxlLmV4cG9ydHMgPSBpbnZlcnQ7XG5cbi8qKlxuICogSW52ZXJ0cyBhIG1hdDRcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQ0fSBhIHRoZSBzb3VyY2UgbWF0cml4XG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbmZ1bmN0aW9uIGludmVydChvdXQsIGEpIHtcbiAgICB2YXIgYTAwID0gYVswXSwgYTAxID0gYVsxXSwgYTAyID0gYVsyXSwgYTAzID0gYVszXSxcbiAgICAgICAgYTEwID0gYVs0XSwgYTExID0gYVs1XSwgYTEyID0gYVs2XSwgYTEzID0gYVs3XSxcbiAgICAgICAgYTIwID0gYVs4XSwgYTIxID0gYVs5XSwgYTIyID0gYVsxMF0sIGEyMyA9IGFbMTFdLFxuICAgICAgICBhMzAgPSBhWzEyXSwgYTMxID0gYVsxM10sIGEzMiA9IGFbMTRdLCBhMzMgPSBhWzE1XSxcblxuICAgICAgICBiMDAgPSBhMDAgKiBhMTEgLSBhMDEgKiBhMTAsXG4gICAgICAgIGIwMSA9IGEwMCAqIGExMiAtIGEwMiAqIGExMCxcbiAgICAgICAgYjAyID0gYTAwICogYTEzIC0gYTAzICogYTEwLFxuICAgICAgICBiMDMgPSBhMDEgKiBhMTIgLSBhMDIgKiBhMTEsXG4gICAgICAgIGIwNCA9IGEwMSAqIGExMyAtIGEwMyAqIGExMSxcbiAgICAgICAgYjA1ID0gYTAyICogYTEzIC0gYTAzICogYTEyLFxuICAgICAgICBiMDYgPSBhMjAgKiBhMzEgLSBhMjEgKiBhMzAsXG4gICAgICAgIGIwNyA9IGEyMCAqIGEzMiAtIGEyMiAqIGEzMCxcbiAgICAgICAgYjA4ID0gYTIwICogYTMzIC0gYTIzICogYTMwLFxuICAgICAgICBiMDkgPSBhMjEgKiBhMzIgLSBhMjIgKiBhMzEsXG4gICAgICAgIGIxMCA9IGEyMSAqIGEzMyAtIGEyMyAqIGEzMSxcbiAgICAgICAgYjExID0gYTIyICogYTMzIC0gYTIzICogYTMyLFxuXG4gICAgICAgIC8vIENhbGN1bGF0ZSB0aGUgZGV0ZXJtaW5hbnRcbiAgICAgICAgZGV0ID0gYjAwICogYjExIC0gYjAxICogYjEwICsgYjAyICogYjA5ICsgYjAzICogYjA4IC0gYjA0ICogYjA3ICsgYjA1ICogYjA2O1xuXG4gICAgaWYgKCFkZXQpIHsgXG4gICAgICAgIHJldHVybiBudWxsOyBcbiAgICB9XG4gICAgZGV0ID0gMS4wIC8gZGV0O1xuXG4gICAgb3V0WzBdID0gKGExMSAqIGIxMSAtIGExMiAqIGIxMCArIGExMyAqIGIwOSkgKiBkZXQ7XG4gICAgb3V0WzFdID0gKGEwMiAqIGIxMCAtIGEwMSAqIGIxMSAtIGEwMyAqIGIwOSkgKiBkZXQ7XG4gICAgb3V0WzJdID0gKGEzMSAqIGIwNSAtIGEzMiAqIGIwNCArIGEzMyAqIGIwMykgKiBkZXQ7XG4gICAgb3V0WzNdID0gKGEyMiAqIGIwNCAtIGEyMSAqIGIwNSAtIGEyMyAqIGIwMykgKiBkZXQ7XG4gICAgb3V0WzRdID0gKGExMiAqIGIwOCAtIGExMCAqIGIxMSAtIGExMyAqIGIwNykgKiBkZXQ7XG4gICAgb3V0WzVdID0gKGEwMCAqIGIxMSAtIGEwMiAqIGIwOCArIGEwMyAqIGIwNykgKiBkZXQ7XG4gICAgb3V0WzZdID0gKGEzMiAqIGIwMiAtIGEzMCAqIGIwNSAtIGEzMyAqIGIwMSkgKiBkZXQ7XG4gICAgb3V0WzddID0gKGEyMCAqIGIwNSAtIGEyMiAqIGIwMiArIGEyMyAqIGIwMSkgKiBkZXQ7XG4gICAgb3V0WzhdID0gKGExMCAqIGIxMCAtIGExMSAqIGIwOCArIGExMyAqIGIwNikgKiBkZXQ7XG4gICAgb3V0WzldID0gKGEwMSAqIGIwOCAtIGEwMCAqIGIxMCAtIGEwMyAqIGIwNikgKiBkZXQ7XG4gICAgb3V0WzEwXSA9IChhMzAgKiBiMDQgLSBhMzEgKiBiMDIgKyBhMzMgKiBiMDApICogZGV0O1xuICAgIG91dFsxMV0gPSAoYTIxICogYjAyIC0gYTIwICogYjA0IC0gYTIzICogYjAwKSAqIGRldDtcbiAgICBvdXRbMTJdID0gKGExMSAqIGIwNyAtIGExMCAqIGIwOSAtIGExMiAqIGIwNikgKiBkZXQ7XG4gICAgb3V0WzEzXSA9IChhMDAgKiBiMDkgLSBhMDEgKiBiMDcgKyBhMDIgKiBiMDYpICogZGV0O1xuICAgIG91dFsxNF0gPSAoYTMxICogYjAxIC0gYTMwICogYjAzIC0gYTMyICogYjAwKSAqIGRldDtcbiAgICBvdXRbMTVdID0gKGEyMCAqIGIwMyAtIGEyMSAqIGIwMSArIGEyMiAqIGIwMCkgKiBkZXQ7XG5cbiAgICByZXR1cm4gb3V0O1xufTsiLCJ2YXIgaWRlbnRpdHkgPSByZXF1aXJlKCcuL2lkZW50aXR5Jyk7XG5cbm1vZHVsZS5leHBvcnRzID0gbG9va0F0O1xuXG4vKipcbiAqIEdlbmVyYXRlcyBhIGxvb2stYXQgbWF0cml4IHdpdGggdGhlIGdpdmVuIGV5ZSBwb3NpdGlvbiwgZm9jYWwgcG9pbnQsIGFuZCB1cCBheGlzXG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgbWF0NCBmcnVzdHVtIG1hdHJpeCB3aWxsIGJlIHdyaXR0ZW4gaW50b1xuICogQHBhcmFtIHt2ZWMzfSBleWUgUG9zaXRpb24gb2YgdGhlIHZpZXdlclxuICogQHBhcmFtIHt2ZWMzfSBjZW50ZXIgUG9pbnQgdGhlIHZpZXdlciBpcyBsb29raW5nIGF0XG4gKiBAcGFyYW0ge3ZlYzN9IHVwIHZlYzMgcG9pbnRpbmcgdXBcbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xuZnVuY3Rpb24gbG9va0F0KG91dCwgZXllLCBjZW50ZXIsIHVwKSB7XG4gICAgdmFyIHgwLCB4MSwgeDIsIHkwLCB5MSwgeTIsIHowLCB6MSwgejIsIGxlbixcbiAgICAgICAgZXlleCA9IGV5ZVswXSxcbiAgICAgICAgZXlleSA9IGV5ZVsxXSxcbiAgICAgICAgZXlleiA9IGV5ZVsyXSxcbiAgICAgICAgdXB4ID0gdXBbMF0sXG4gICAgICAgIHVweSA9IHVwWzFdLFxuICAgICAgICB1cHogPSB1cFsyXSxcbiAgICAgICAgY2VudGVyeCA9IGNlbnRlclswXSxcbiAgICAgICAgY2VudGVyeSA9IGNlbnRlclsxXSxcbiAgICAgICAgY2VudGVyeiA9IGNlbnRlclsyXTtcblxuICAgIGlmIChNYXRoLmFicyhleWV4IC0gY2VudGVyeCkgPCAwLjAwMDAwMSAmJlxuICAgICAgICBNYXRoLmFicyhleWV5IC0gY2VudGVyeSkgPCAwLjAwMDAwMSAmJlxuICAgICAgICBNYXRoLmFicyhleWV6IC0gY2VudGVyeikgPCAwLjAwMDAwMSkge1xuICAgICAgICByZXR1cm4gaWRlbnRpdHkob3V0KTtcbiAgICB9XG5cbiAgICB6MCA9IGV5ZXggLSBjZW50ZXJ4O1xuICAgIHoxID0gZXlleSAtIGNlbnRlcnk7XG4gICAgejIgPSBleWV6IC0gY2VudGVyejtcblxuICAgIGxlbiA9IDEgLyBNYXRoLnNxcnQoejAgKiB6MCArIHoxICogejEgKyB6MiAqIHoyKTtcbiAgICB6MCAqPSBsZW47XG4gICAgejEgKj0gbGVuO1xuICAgIHoyICo9IGxlbjtcblxuICAgIHgwID0gdXB5ICogejIgLSB1cHogKiB6MTtcbiAgICB4MSA9IHVweiAqIHowIC0gdXB4ICogejI7XG4gICAgeDIgPSB1cHggKiB6MSAtIHVweSAqIHowO1xuICAgIGxlbiA9IE1hdGguc3FydCh4MCAqIHgwICsgeDEgKiB4MSArIHgyICogeDIpO1xuICAgIGlmICghbGVuKSB7XG4gICAgICAgIHgwID0gMDtcbiAgICAgICAgeDEgPSAwO1xuICAgICAgICB4MiA9IDA7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgbGVuID0gMSAvIGxlbjtcbiAgICAgICAgeDAgKj0gbGVuO1xuICAgICAgICB4MSAqPSBsZW47XG4gICAgICAgIHgyICo9IGxlbjtcbiAgICB9XG5cbiAgICB5MCA9IHoxICogeDIgLSB6MiAqIHgxO1xuICAgIHkxID0gejIgKiB4MCAtIHowICogeDI7XG4gICAgeTIgPSB6MCAqIHgxIC0gejEgKiB4MDtcblxuICAgIGxlbiA9IE1hdGguc3FydCh5MCAqIHkwICsgeTEgKiB5MSArIHkyICogeTIpO1xuICAgIGlmICghbGVuKSB7XG4gICAgICAgIHkwID0gMDtcbiAgICAgICAgeTEgPSAwO1xuICAgICAgICB5MiA9IDA7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgbGVuID0gMSAvIGxlbjtcbiAgICAgICAgeTAgKj0gbGVuO1xuICAgICAgICB5MSAqPSBsZW47XG4gICAgICAgIHkyICo9IGxlbjtcbiAgICB9XG5cbiAgICBvdXRbMF0gPSB4MDtcbiAgICBvdXRbMV0gPSB5MDtcbiAgICBvdXRbMl0gPSB6MDtcbiAgICBvdXRbM10gPSAwO1xuICAgIG91dFs0XSA9IHgxO1xuICAgIG91dFs1XSA9IHkxO1xuICAgIG91dFs2XSA9IHoxO1xuICAgIG91dFs3XSA9IDA7XG4gICAgb3V0WzhdID0geDI7XG4gICAgb3V0WzldID0geTI7XG4gICAgb3V0WzEwXSA9IHoyO1xuICAgIG91dFsxMV0gPSAwO1xuICAgIG91dFsxMl0gPSAtKHgwICogZXlleCArIHgxICogZXlleSArIHgyICogZXlleik7XG4gICAgb3V0WzEzXSA9IC0oeTAgKiBleWV4ICsgeTEgKiBleWV5ICsgeTIgKiBleWV6KTtcbiAgICBvdXRbMTRdID0gLSh6MCAqIGV5ZXggKyB6MSAqIGV5ZXkgKyB6MiAqIGV5ZXopO1xuICAgIG91dFsxNV0gPSAxO1xuXG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSBtdWx0aXBseTtcblxuLyoqXG4gKiBNdWx0aXBsaWVzIHR3byBtYXQ0J3NcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQ0fSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge21hdDR9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbmZ1bmN0aW9uIG11bHRpcGx5KG91dCwgYSwgYikge1xuICAgIHZhciBhMDAgPSBhWzBdLCBhMDEgPSBhWzFdLCBhMDIgPSBhWzJdLCBhMDMgPSBhWzNdLFxuICAgICAgICBhMTAgPSBhWzRdLCBhMTEgPSBhWzVdLCBhMTIgPSBhWzZdLCBhMTMgPSBhWzddLFxuICAgICAgICBhMjAgPSBhWzhdLCBhMjEgPSBhWzldLCBhMjIgPSBhWzEwXSwgYTIzID0gYVsxMV0sXG4gICAgICAgIGEzMCA9IGFbMTJdLCBhMzEgPSBhWzEzXSwgYTMyID0gYVsxNF0sIGEzMyA9IGFbMTVdO1xuXG4gICAgLy8gQ2FjaGUgb25seSB0aGUgY3VycmVudCBsaW5lIG9mIHRoZSBzZWNvbmQgbWF0cml4XG4gICAgdmFyIGIwICA9IGJbMF0sIGIxID0gYlsxXSwgYjIgPSBiWzJdLCBiMyA9IGJbM107ICBcbiAgICBvdXRbMF0gPSBiMCphMDAgKyBiMSphMTAgKyBiMiphMjAgKyBiMyphMzA7XG4gICAgb3V0WzFdID0gYjAqYTAxICsgYjEqYTExICsgYjIqYTIxICsgYjMqYTMxO1xuICAgIG91dFsyXSA9IGIwKmEwMiArIGIxKmExMiArIGIyKmEyMiArIGIzKmEzMjtcbiAgICBvdXRbM10gPSBiMCphMDMgKyBiMSphMTMgKyBiMiphMjMgKyBiMyphMzM7XG5cbiAgICBiMCA9IGJbNF07IGIxID0gYls1XTsgYjIgPSBiWzZdOyBiMyA9IGJbN107XG4gICAgb3V0WzRdID0gYjAqYTAwICsgYjEqYTEwICsgYjIqYTIwICsgYjMqYTMwO1xuICAgIG91dFs1XSA9IGIwKmEwMSArIGIxKmExMSArIGIyKmEyMSArIGIzKmEzMTtcbiAgICBvdXRbNl0gPSBiMCphMDIgKyBiMSphMTIgKyBiMiphMjIgKyBiMyphMzI7XG4gICAgb3V0WzddID0gYjAqYTAzICsgYjEqYTEzICsgYjIqYTIzICsgYjMqYTMzO1xuXG4gICAgYjAgPSBiWzhdOyBiMSA9IGJbOV07IGIyID0gYlsxMF07IGIzID0gYlsxMV07XG4gICAgb3V0WzhdID0gYjAqYTAwICsgYjEqYTEwICsgYjIqYTIwICsgYjMqYTMwO1xuICAgIG91dFs5XSA9IGIwKmEwMSArIGIxKmExMSArIGIyKmEyMSArIGIzKmEzMTtcbiAgICBvdXRbMTBdID0gYjAqYTAyICsgYjEqYTEyICsgYjIqYTIyICsgYjMqYTMyO1xuICAgIG91dFsxMV0gPSBiMCphMDMgKyBiMSphMTMgKyBiMiphMjMgKyBiMyphMzM7XG5cbiAgICBiMCA9IGJbMTJdOyBiMSA9IGJbMTNdOyBiMiA9IGJbMTRdOyBiMyA9IGJbMTVdO1xuICAgIG91dFsxMl0gPSBiMCphMDAgKyBiMSphMTAgKyBiMiphMjAgKyBiMyphMzA7XG4gICAgb3V0WzEzXSA9IGIwKmEwMSArIGIxKmExMSArIGIyKmEyMSArIGIzKmEzMTtcbiAgICBvdXRbMTRdID0gYjAqYTAyICsgYjEqYTEyICsgYjIqYTIyICsgYjMqYTMyO1xuICAgIG91dFsxNV0gPSBiMCphMDMgKyBiMSphMTMgKyBiMiphMjMgKyBiMyphMzM7XG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSBvcnRobztcblxuLyoqXG4gKiBHZW5lcmF0ZXMgYSBvcnRob2dvbmFsIHByb2plY3Rpb24gbWF0cml4IHdpdGggdGhlIGdpdmVuIGJvdW5kc1xuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IG1hdDQgZnJ1c3R1bSBtYXRyaXggd2lsbCBiZSB3cml0dGVuIGludG9cbiAqIEBwYXJhbSB7bnVtYmVyfSBsZWZ0IExlZnQgYm91bmQgb2YgdGhlIGZydXN0dW1cbiAqIEBwYXJhbSB7bnVtYmVyfSByaWdodCBSaWdodCBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHBhcmFtIHtudW1iZXJ9IGJvdHRvbSBCb3R0b20gYm91bmQgb2YgdGhlIGZydXN0dW1cbiAqIEBwYXJhbSB7bnVtYmVyfSB0b3AgVG9wIGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcGFyYW0ge251bWJlcn0gbmVhciBOZWFyIGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcGFyYW0ge251bWJlcn0gZmFyIEZhciBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5mdW5jdGlvbiBvcnRobyhvdXQsIGxlZnQsIHJpZ2h0LCBib3R0b20sIHRvcCwgbmVhciwgZmFyKSB7XG4gICAgdmFyIGxyID0gMSAvIChsZWZ0IC0gcmlnaHQpLFxuICAgICAgICBidCA9IDEgLyAoYm90dG9tIC0gdG9wKSxcbiAgICAgICAgbmYgPSAxIC8gKG5lYXIgLSBmYXIpO1xuICAgIG91dFswXSA9IC0yICogbHI7XG4gICAgb3V0WzFdID0gMDtcbiAgICBvdXRbMl0gPSAwO1xuICAgIG91dFszXSA9IDA7XG4gICAgb3V0WzRdID0gMDtcbiAgICBvdXRbNV0gPSAtMiAqIGJ0O1xuICAgIG91dFs2XSA9IDA7XG4gICAgb3V0WzddID0gMDtcbiAgICBvdXRbOF0gPSAwO1xuICAgIG91dFs5XSA9IDA7XG4gICAgb3V0WzEwXSA9IDIgKiBuZjtcbiAgICBvdXRbMTFdID0gMDtcbiAgICBvdXRbMTJdID0gKGxlZnQgKyByaWdodCkgKiBscjtcbiAgICBvdXRbMTNdID0gKHRvcCArIGJvdHRvbSkgKiBidDtcbiAgICBvdXRbMTRdID0gKGZhciArIG5lYXIpICogbmY7XG4gICAgb3V0WzE1XSA9IDE7XG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSBwZXJzcGVjdGl2ZTtcblxuLyoqXG4gKiBHZW5lcmF0ZXMgYSBwZXJzcGVjdGl2ZSBwcm9qZWN0aW9uIG1hdHJpeCB3aXRoIHRoZSBnaXZlbiBib3VuZHNcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCBtYXQ0IGZydXN0dW0gbWF0cml4IHdpbGwgYmUgd3JpdHRlbiBpbnRvXG4gKiBAcGFyYW0ge251bWJlcn0gZm92eSBWZXJ0aWNhbCBmaWVsZCBvZiB2aWV3IGluIHJhZGlhbnNcbiAqIEBwYXJhbSB7bnVtYmVyfSBhc3BlY3QgQXNwZWN0IHJhdGlvLiB0eXBpY2FsbHkgdmlld3BvcnQgd2lkdGgvaGVpZ2h0XG4gKiBAcGFyYW0ge251bWJlcn0gbmVhciBOZWFyIGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcGFyYW0ge251bWJlcn0gZmFyIEZhciBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5mdW5jdGlvbiBwZXJzcGVjdGl2ZShvdXQsIGZvdnksIGFzcGVjdCwgbmVhciwgZmFyKSB7XG4gICAgdmFyIGYgPSAxLjAgLyBNYXRoLnRhbihmb3Z5IC8gMiksXG4gICAgICAgIG5mID0gMSAvIChuZWFyIC0gZmFyKTtcbiAgICBvdXRbMF0gPSBmIC8gYXNwZWN0O1xuICAgIG91dFsxXSA9IDA7XG4gICAgb3V0WzJdID0gMDtcbiAgICBvdXRbM10gPSAwO1xuICAgIG91dFs0XSA9IDA7XG4gICAgb3V0WzVdID0gZjtcbiAgICBvdXRbNl0gPSAwO1xuICAgIG91dFs3XSA9IDA7XG4gICAgb3V0WzhdID0gMDtcbiAgICBvdXRbOV0gPSAwO1xuICAgIG91dFsxMF0gPSAoZmFyICsgbmVhcikgKiBuZjtcbiAgICBvdXRbMTFdID0gLTE7XG4gICAgb3V0WzEyXSA9IDA7XG4gICAgb3V0WzEzXSA9IDA7XG4gICAgb3V0WzE0XSA9ICgyICogZmFyICogbmVhcikgKiBuZjtcbiAgICBvdXRbMTVdID0gMDtcbiAgICByZXR1cm4gb3V0O1xufTsiLCJtb2R1bGUuZXhwb3J0cyA9IHBlcnNwZWN0aXZlRnJvbUZpZWxkT2ZWaWV3O1xuXG4vKipcbiAqIEdlbmVyYXRlcyBhIHBlcnNwZWN0aXZlIHByb2plY3Rpb24gbWF0cml4IHdpdGggdGhlIGdpdmVuIGZpZWxkIG9mIHZpZXcuXG4gKiBUaGlzIGlzIHByaW1hcmlseSB1c2VmdWwgZm9yIGdlbmVyYXRpbmcgcHJvamVjdGlvbiBtYXRyaWNlcyB0byBiZSB1c2VkXG4gKiB3aXRoIHRoZSBzdGlsbCBleHBlcmllbWVudGFsIFdlYlZSIEFQSS5cbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCBtYXQ0IGZydXN0dW0gbWF0cml4IHdpbGwgYmUgd3JpdHRlbiBpbnRvXG4gKiBAcGFyYW0ge251bWJlcn0gZm92IE9iamVjdCBjb250YWluaW5nIHRoZSBmb2xsb3dpbmcgdmFsdWVzOiB1cERlZ3JlZXMsIGRvd25EZWdyZWVzLCBsZWZ0RGVncmVlcywgcmlnaHREZWdyZWVzXG4gKiBAcGFyYW0ge251bWJlcn0gbmVhciBOZWFyIGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcGFyYW0ge251bWJlcn0gZmFyIEZhciBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5mdW5jdGlvbiBwZXJzcGVjdGl2ZUZyb21GaWVsZE9mVmlldyhvdXQsIGZvdiwgbmVhciwgZmFyKSB7XG4gICAgdmFyIHVwVGFuID0gTWF0aC50YW4oZm92LnVwRGVncmVlcyAqIE1hdGguUEkvMTgwLjApLFxuICAgICAgICBkb3duVGFuID0gTWF0aC50YW4oZm92LmRvd25EZWdyZWVzICogTWF0aC5QSS8xODAuMCksXG4gICAgICAgIGxlZnRUYW4gPSBNYXRoLnRhbihmb3YubGVmdERlZ3JlZXMgKiBNYXRoLlBJLzE4MC4wKSxcbiAgICAgICAgcmlnaHRUYW4gPSBNYXRoLnRhbihmb3YucmlnaHREZWdyZWVzICogTWF0aC5QSS8xODAuMCksXG4gICAgICAgIHhTY2FsZSA9IDIuMCAvIChsZWZ0VGFuICsgcmlnaHRUYW4pLFxuICAgICAgICB5U2NhbGUgPSAyLjAgLyAodXBUYW4gKyBkb3duVGFuKTtcblxuICAgIG91dFswXSA9IHhTY2FsZTtcbiAgICBvdXRbMV0gPSAwLjA7XG4gICAgb3V0WzJdID0gMC4wO1xuICAgIG91dFszXSA9IDAuMDtcbiAgICBvdXRbNF0gPSAwLjA7XG4gICAgb3V0WzVdID0geVNjYWxlO1xuICAgIG91dFs2XSA9IDAuMDtcbiAgICBvdXRbN10gPSAwLjA7XG4gICAgb3V0WzhdID0gLSgobGVmdFRhbiAtIHJpZ2h0VGFuKSAqIHhTY2FsZSAqIDAuNSk7XG4gICAgb3V0WzldID0gKCh1cFRhbiAtIGRvd25UYW4pICogeVNjYWxlICogMC41KTtcbiAgICBvdXRbMTBdID0gZmFyIC8gKG5lYXIgLSBmYXIpO1xuICAgIG91dFsxMV0gPSAtMS4wO1xuICAgIG91dFsxMl0gPSAwLjA7XG4gICAgb3V0WzEzXSA9IDAuMDtcbiAgICBvdXRbMTRdID0gKGZhciAqIG5lYXIpIC8gKG5lYXIgLSBmYXIpO1xuICAgIG91dFsxNV0gPSAwLjA7XG4gICAgcmV0dXJuIG91dDtcbn1cblxuIiwibW9kdWxlLmV4cG9ydHMgPSByb3RhdGU7XG5cbi8qKlxuICogUm90YXRlcyBhIG1hdDQgYnkgdGhlIGdpdmVuIGFuZ2xlXG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0NH0gYSB0aGUgbWF0cml4IHRvIHJvdGF0ZVxuICogQHBhcmFtIHtOdW1iZXJ9IHJhZCB0aGUgYW5nbGUgdG8gcm90YXRlIHRoZSBtYXRyaXggYnlcbiAqIEBwYXJhbSB7dmVjM30gYXhpcyB0aGUgYXhpcyB0byByb3RhdGUgYXJvdW5kXG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbmZ1bmN0aW9uIHJvdGF0ZShvdXQsIGEsIHJhZCwgYXhpcykge1xuICAgIHZhciB4ID0gYXhpc1swXSwgeSA9IGF4aXNbMV0sIHogPSBheGlzWzJdLFxuICAgICAgICBsZW4gPSBNYXRoLnNxcnQoeCAqIHggKyB5ICogeSArIHogKiB6KSxcbiAgICAgICAgcywgYywgdCxcbiAgICAgICAgYTAwLCBhMDEsIGEwMiwgYTAzLFxuICAgICAgICBhMTAsIGExMSwgYTEyLCBhMTMsXG4gICAgICAgIGEyMCwgYTIxLCBhMjIsIGEyMyxcbiAgICAgICAgYjAwLCBiMDEsIGIwMixcbiAgICAgICAgYjEwLCBiMTEsIGIxMixcbiAgICAgICAgYjIwLCBiMjEsIGIyMjtcblxuICAgIGlmIChNYXRoLmFicyhsZW4pIDwgMC4wMDAwMDEpIHsgcmV0dXJuIG51bGw7IH1cbiAgICBcbiAgICBsZW4gPSAxIC8gbGVuO1xuICAgIHggKj0gbGVuO1xuICAgIHkgKj0gbGVuO1xuICAgIHogKj0gbGVuO1xuXG4gICAgcyA9IE1hdGguc2luKHJhZCk7XG4gICAgYyA9IE1hdGguY29zKHJhZCk7XG4gICAgdCA9IDEgLSBjO1xuXG4gICAgYTAwID0gYVswXTsgYTAxID0gYVsxXTsgYTAyID0gYVsyXTsgYTAzID0gYVszXTtcbiAgICBhMTAgPSBhWzRdOyBhMTEgPSBhWzVdOyBhMTIgPSBhWzZdOyBhMTMgPSBhWzddO1xuICAgIGEyMCA9IGFbOF07IGEyMSA9IGFbOV07IGEyMiA9IGFbMTBdOyBhMjMgPSBhWzExXTtcblxuICAgIC8vIENvbnN0cnVjdCB0aGUgZWxlbWVudHMgb2YgdGhlIHJvdGF0aW9uIG1hdHJpeFxuICAgIGIwMCA9IHggKiB4ICogdCArIGM7IGIwMSA9IHkgKiB4ICogdCArIHogKiBzOyBiMDIgPSB6ICogeCAqIHQgLSB5ICogcztcbiAgICBiMTAgPSB4ICogeSAqIHQgLSB6ICogczsgYjExID0geSAqIHkgKiB0ICsgYzsgYjEyID0geiAqIHkgKiB0ICsgeCAqIHM7XG4gICAgYjIwID0geCAqIHogKiB0ICsgeSAqIHM7IGIyMSA9IHkgKiB6ICogdCAtIHggKiBzOyBiMjIgPSB6ICogeiAqIHQgKyBjO1xuXG4gICAgLy8gUGVyZm9ybSByb3RhdGlvbi1zcGVjaWZpYyBtYXRyaXggbXVsdGlwbGljYXRpb25cbiAgICBvdXRbMF0gPSBhMDAgKiBiMDAgKyBhMTAgKiBiMDEgKyBhMjAgKiBiMDI7XG4gICAgb3V0WzFdID0gYTAxICogYjAwICsgYTExICogYjAxICsgYTIxICogYjAyO1xuICAgIG91dFsyXSA9IGEwMiAqIGIwMCArIGExMiAqIGIwMSArIGEyMiAqIGIwMjtcbiAgICBvdXRbM10gPSBhMDMgKiBiMDAgKyBhMTMgKiBiMDEgKyBhMjMgKiBiMDI7XG4gICAgb3V0WzRdID0gYTAwICogYjEwICsgYTEwICogYjExICsgYTIwICogYjEyO1xuICAgIG91dFs1XSA9IGEwMSAqIGIxMCArIGExMSAqIGIxMSArIGEyMSAqIGIxMjtcbiAgICBvdXRbNl0gPSBhMDIgKiBiMTAgKyBhMTIgKiBiMTEgKyBhMjIgKiBiMTI7XG4gICAgb3V0WzddID0gYTAzICogYjEwICsgYTEzICogYjExICsgYTIzICogYjEyO1xuICAgIG91dFs4XSA9IGEwMCAqIGIyMCArIGExMCAqIGIyMSArIGEyMCAqIGIyMjtcbiAgICBvdXRbOV0gPSBhMDEgKiBiMjAgKyBhMTEgKiBiMjEgKyBhMjEgKiBiMjI7XG4gICAgb3V0WzEwXSA9IGEwMiAqIGIyMCArIGExMiAqIGIyMSArIGEyMiAqIGIyMjtcbiAgICBvdXRbMTFdID0gYTAzICogYjIwICsgYTEzICogYjIxICsgYTIzICogYjIyO1xuXG4gICAgaWYgKGEgIT09IG91dCkgeyAvLyBJZiB0aGUgc291cmNlIGFuZCBkZXN0aW5hdGlvbiBkaWZmZXIsIGNvcHkgdGhlIHVuY2hhbmdlZCBsYXN0IHJvd1xuICAgICAgICBvdXRbMTJdID0gYVsxMl07XG4gICAgICAgIG91dFsxM10gPSBhWzEzXTtcbiAgICAgICAgb3V0WzE0XSA9IGFbMTRdO1xuICAgICAgICBvdXRbMTVdID0gYVsxNV07XG4gICAgfVxuICAgIHJldHVybiBvdXQ7XG59OyIsIm1vZHVsZS5leHBvcnRzID0gcm90YXRlWDtcblxuLyoqXG4gKiBSb3RhdGVzIGEgbWF0cml4IGJ5IHRoZSBnaXZlbiBhbmdsZSBhcm91bmQgdGhlIFggYXhpc1xuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDR9IGEgdGhlIG1hdHJpeCB0byByb3RhdGVcbiAqIEBwYXJhbSB7TnVtYmVyfSByYWQgdGhlIGFuZ2xlIHRvIHJvdGF0ZSB0aGUgbWF0cml4IGJ5XG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbmZ1bmN0aW9uIHJvdGF0ZVgob3V0LCBhLCByYWQpIHtcbiAgICB2YXIgcyA9IE1hdGguc2luKHJhZCksXG4gICAgICAgIGMgPSBNYXRoLmNvcyhyYWQpLFxuICAgICAgICBhMTAgPSBhWzRdLFxuICAgICAgICBhMTEgPSBhWzVdLFxuICAgICAgICBhMTIgPSBhWzZdLFxuICAgICAgICBhMTMgPSBhWzddLFxuICAgICAgICBhMjAgPSBhWzhdLFxuICAgICAgICBhMjEgPSBhWzldLFxuICAgICAgICBhMjIgPSBhWzEwXSxcbiAgICAgICAgYTIzID0gYVsxMV07XG5cbiAgICBpZiAoYSAhPT0gb3V0KSB7IC8vIElmIHRoZSBzb3VyY2UgYW5kIGRlc3RpbmF0aW9uIGRpZmZlciwgY29weSB0aGUgdW5jaGFuZ2VkIHJvd3NcbiAgICAgICAgb3V0WzBdICA9IGFbMF07XG4gICAgICAgIG91dFsxXSAgPSBhWzFdO1xuICAgICAgICBvdXRbMl0gID0gYVsyXTtcbiAgICAgICAgb3V0WzNdICA9IGFbM107XG4gICAgICAgIG91dFsxMl0gPSBhWzEyXTtcbiAgICAgICAgb3V0WzEzXSA9IGFbMTNdO1xuICAgICAgICBvdXRbMTRdID0gYVsxNF07XG4gICAgICAgIG91dFsxNV0gPSBhWzE1XTtcbiAgICB9XG5cbiAgICAvLyBQZXJmb3JtIGF4aXMtc3BlY2lmaWMgbWF0cml4IG11bHRpcGxpY2F0aW9uXG4gICAgb3V0WzRdID0gYTEwICogYyArIGEyMCAqIHM7XG4gICAgb3V0WzVdID0gYTExICogYyArIGEyMSAqIHM7XG4gICAgb3V0WzZdID0gYTEyICogYyArIGEyMiAqIHM7XG4gICAgb3V0WzddID0gYTEzICogYyArIGEyMyAqIHM7XG4gICAgb3V0WzhdID0gYTIwICogYyAtIGExMCAqIHM7XG4gICAgb3V0WzldID0gYTIxICogYyAtIGExMSAqIHM7XG4gICAgb3V0WzEwXSA9IGEyMiAqIGMgLSBhMTIgKiBzO1xuICAgIG91dFsxMV0gPSBhMjMgKiBjIC0gYTEzICogcztcbiAgICByZXR1cm4gb3V0O1xufTsiLCJtb2R1bGUuZXhwb3J0cyA9IHJvdGF0ZVk7XG5cbi8qKlxuICogUm90YXRlcyBhIG1hdHJpeCBieSB0aGUgZ2l2ZW4gYW5nbGUgYXJvdW5kIHRoZSBZIGF4aXNcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQ0fSBhIHRoZSBtYXRyaXggdG8gcm90YXRlXG4gKiBAcGFyYW0ge051bWJlcn0gcmFkIHRoZSBhbmdsZSB0byByb3RhdGUgdGhlIG1hdHJpeCBieVxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5mdW5jdGlvbiByb3RhdGVZKG91dCwgYSwgcmFkKSB7XG4gICAgdmFyIHMgPSBNYXRoLnNpbihyYWQpLFxuICAgICAgICBjID0gTWF0aC5jb3MocmFkKSxcbiAgICAgICAgYTAwID0gYVswXSxcbiAgICAgICAgYTAxID0gYVsxXSxcbiAgICAgICAgYTAyID0gYVsyXSxcbiAgICAgICAgYTAzID0gYVszXSxcbiAgICAgICAgYTIwID0gYVs4XSxcbiAgICAgICAgYTIxID0gYVs5XSxcbiAgICAgICAgYTIyID0gYVsxMF0sXG4gICAgICAgIGEyMyA9IGFbMTFdO1xuXG4gICAgaWYgKGEgIT09IG91dCkgeyAvLyBJZiB0aGUgc291cmNlIGFuZCBkZXN0aW5hdGlvbiBkaWZmZXIsIGNvcHkgdGhlIHVuY2hhbmdlZCByb3dzXG4gICAgICAgIG91dFs0XSAgPSBhWzRdO1xuICAgICAgICBvdXRbNV0gID0gYVs1XTtcbiAgICAgICAgb3V0WzZdICA9IGFbNl07XG4gICAgICAgIG91dFs3XSAgPSBhWzddO1xuICAgICAgICBvdXRbMTJdID0gYVsxMl07XG4gICAgICAgIG91dFsxM10gPSBhWzEzXTtcbiAgICAgICAgb3V0WzE0XSA9IGFbMTRdO1xuICAgICAgICBvdXRbMTVdID0gYVsxNV07XG4gICAgfVxuXG4gICAgLy8gUGVyZm9ybSBheGlzLXNwZWNpZmljIG1hdHJpeCBtdWx0aXBsaWNhdGlvblxuICAgIG91dFswXSA9IGEwMCAqIGMgLSBhMjAgKiBzO1xuICAgIG91dFsxXSA9IGEwMSAqIGMgLSBhMjEgKiBzO1xuICAgIG91dFsyXSA9IGEwMiAqIGMgLSBhMjIgKiBzO1xuICAgIG91dFszXSA9IGEwMyAqIGMgLSBhMjMgKiBzO1xuICAgIG91dFs4XSA9IGEwMCAqIHMgKyBhMjAgKiBjO1xuICAgIG91dFs5XSA9IGEwMSAqIHMgKyBhMjEgKiBjO1xuICAgIG91dFsxMF0gPSBhMDIgKiBzICsgYTIyICogYztcbiAgICBvdXRbMTFdID0gYTAzICogcyArIGEyMyAqIGM7XG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSByb3RhdGVaO1xuXG4vKipcbiAqIFJvdGF0ZXMgYSBtYXRyaXggYnkgdGhlIGdpdmVuIGFuZ2xlIGFyb3VuZCB0aGUgWiBheGlzXG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0NH0gYSB0aGUgbWF0cml4IHRvIHJvdGF0ZVxuICogQHBhcmFtIHtOdW1iZXJ9IHJhZCB0aGUgYW5nbGUgdG8gcm90YXRlIHRoZSBtYXRyaXggYnlcbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xuZnVuY3Rpb24gcm90YXRlWihvdXQsIGEsIHJhZCkge1xuICAgIHZhciBzID0gTWF0aC5zaW4ocmFkKSxcbiAgICAgICAgYyA9IE1hdGguY29zKHJhZCksXG4gICAgICAgIGEwMCA9IGFbMF0sXG4gICAgICAgIGEwMSA9IGFbMV0sXG4gICAgICAgIGEwMiA9IGFbMl0sXG4gICAgICAgIGEwMyA9IGFbM10sXG4gICAgICAgIGExMCA9IGFbNF0sXG4gICAgICAgIGExMSA9IGFbNV0sXG4gICAgICAgIGExMiA9IGFbNl0sXG4gICAgICAgIGExMyA9IGFbN107XG5cbiAgICBpZiAoYSAhPT0gb3V0KSB7IC8vIElmIHRoZSBzb3VyY2UgYW5kIGRlc3RpbmF0aW9uIGRpZmZlciwgY29weSB0aGUgdW5jaGFuZ2VkIGxhc3Qgcm93XG4gICAgICAgIG91dFs4XSAgPSBhWzhdO1xuICAgICAgICBvdXRbOV0gID0gYVs5XTtcbiAgICAgICAgb3V0WzEwXSA9IGFbMTBdO1xuICAgICAgICBvdXRbMTFdID0gYVsxMV07XG4gICAgICAgIG91dFsxMl0gPSBhWzEyXTtcbiAgICAgICAgb3V0WzEzXSA9IGFbMTNdO1xuICAgICAgICBvdXRbMTRdID0gYVsxNF07XG4gICAgICAgIG91dFsxNV0gPSBhWzE1XTtcbiAgICB9XG5cbiAgICAvLyBQZXJmb3JtIGF4aXMtc3BlY2lmaWMgbWF0cml4IG11bHRpcGxpY2F0aW9uXG4gICAgb3V0WzBdID0gYTAwICogYyArIGExMCAqIHM7XG4gICAgb3V0WzFdID0gYTAxICogYyArIGExMSAqIHM7XG4gICAgb3V0WzJdID0gYTAyICogYyArIGExMiAqIHM7XG4gICAgb3V0WzNdID0gYTAzICogYyArIGExMyAqIHM7XG4gICAgb3V0WzRdID0gYTEwICogYyAtIGEwMCAqIHM7XG4gICAgb3V0WzVdID0gYTExICogYyAtIGEwMSAqIHM7XG4gICAgb3V0WzZdID0gYTEyICogYyAtIGEwMiAqIHM7XG4gICAgb3V0WzddID0gYTEzICogYyAtIGEwMyAqIHM7XG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSBzY2FsZTtcblxuLyoqXG4gKiBTY2FsZXMgdGhlIG1hdDQgYnkgdGhlIGRpbWVuc2lvbnMgaW4gdGhlIGdpdmVuIHZlYzNcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQ0fSBhIHRoZSBtYXRyaXggdG8gc2NhbGVcbiAqIEBwYXJhbSB7dmVjM30gdiB0aGUgdmVjMyB0byBzY2FsZSB0aGUgbWF0cml4IGJ5XG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKiovXG5mdW5jdGlvbiBzY2FsZShvdXQsIGEsIHYpIHtcbiAgICB2YXIgeCA9IHZbMF0sIHkgPSB2WzFdLCB6ID0gdlsyXTtcblxuICAgIG91dFswXSA9IGFbMF0gKiB4O1xuICAgIG91dFsxXSA9IGFbMV0gKiB4O1xuICAgIG91dFsyXSA9IGFbMl0gKiB4O1xuICAgIG91dFszXSA9IGFbM10gKiB4O1xuICAgIG91dFs0XSA9IGFbNF0gKiB5O1xuICAgIG91dFs1XSA9IGFbNV0gKiB5O1xuICAgIG91dFs2XSA9IGFbNl0gKiB5O1xuICAgIG91dFs3XSA9IGFbN10gKiB5O1xuICAgIG91dFs4XSA9IGFbOF0gKiB6O1xuICAgIG91dFs5XSA9IGFbOV0gKiB6O1xuICAgIG91dFsxMF0gPSBhWzEwXSAqIHo7XG4gICAgb3V0WzExXSA9IGFbMTFdICogejtcbiAgICBvdXRbMTJdID0gYVsxMl07XG4gICAgb3V0WzEzXSA9IGFbMTNdO1xuICAgIG91dFsxNF0gPSBhWzE0XTtcbiAgICBvdXRbMTVdID0gYVsxNV07XG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSBzdHI7XG5cbi8qKlxuICogUmV0dXJucyBhIHN0cmluZyByZXByZXNlbnRhdGlvbiBvZiBhIG1hdDRcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG1hdCBtYXRyaXggdG8gcmVwcmVzZW50IGFzIGEgc3RyaW5nXG4gKiBAcmV0dXJucyB7U3RyaW5nfSBzdHJpbmcgcmVwcmVzZW50YXRpb24gb2YgdGhlIG1hdHJpeFxuICovXG5mdW5jdGlvbiBzdHIoYSkge1xuICAgIHJldHVybiAnbWF0NCgnICsgYVswXSArICcsICcgKyBhWzFdICsgJywgJyArIGFbMl0gKyAnLCAnICsgYVszXSArICcsICcgK1xuICAgICAgICAgICAgICAgICAgICBhWzRdICsgJywgJyArIGFbNV0gKyAnLCAnICsgYVs2XSArICcsICcgKyBhWzddICsgJywgJyArXG4gICAgICAgICAgICAgICAgICAgIGFbOF0gKyAnLCAnICsgYVs5XSArICcsICcgKyBhWzEwXSArICcsICcgKyBhWzExXSArICcsICcgKyBcbiAgICAgICAgICAgICAgICAgICAgYVsxMl0gKyAnLCAnICsgYVsxM10gKyAnLCAnICsgYVsxNF0gKyAnLCAnICsgYVsxNV0gKyAnKSc7XG59OyIsIm1vZHVsZS5leHBvcnRzID0gdHJhbnNsYXRlO1xuXG4vKipcbiAqIFRyYW5zbGF0ZSBhIG1hdDQgYnkgdGhlIGdpdmVuIHZlY3RvclxuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDR9IGEgdGhlIG1hdHJpeCB0byB0cmFuc2xhdGVcbiAqIEBwYXJhbSB7dmVjM30gdiB2ZWN0b3IgdG8gdHJhbnNsYXRlIGJ5XG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbmZ1bmN0aW9uIHRyYW5zbGF0ZShvdXQsIGEsIHYpIHtcbiAgICB2YXIgeCA9IHZbMF0sIHkgPSB2WzFdLCB6ID0gdlsyXSxcbiAgICAgICAgYTAwLCBhMDEsIGEwMiwgYTAzLFxuICAgICAgICBhMTAsIGExMSwgYTEyLCBhMTMsXG4gICAgICAgIGEyMCwgYTIxLCBhMjIsIGEyMztcblxuICAgIGlmIChhID09PSBvdXQpIHtcbiAgICAgICAgb3V0WzEyXSA9IGFbMF0gKiB4ICsgYVs0XSAqIHkgKyBhWzhdICogeiArIGFbMTJdO1xuICAgICAgICBvdXRbMTNdID0gYVsxXSAqIHggKyBhWzVdICogeSArIGFbOV0gKiB6ICsgYVsxM107XG4gICAgICAgIG91dFsxNF0gPSBhWzJdICogeCArIGFbNl0gKiB5ICsgYVsxMF0gKiB6ICsgYVsxNF07XG4gICAgICAgIG91dFsxNV0gPSBhWzNdICogeCArIGFbN10gKiB5ICsgYVsxMV0gKiB6ICsgYVsxNV07XG4gICAgfSBlbHNlIHtcbiAgICAgICAgYTAwID0gYVswXTsgYTAxID0gYVsxXTsgYTAyID0gYVsyXTsgYTAzID0gYVszXTtcbiAgICAgICAgYTEwID0gYVs0XTsgYTExID0gYVs1XTsgYTEyID0gYVs2XTsgYTEzID0gYVs3XTtcbiAgICAgICAgYTIwID0gYVs4XTsgYTIxID0gYVs5XTsgYTIyID0gYVsxMF07IGEyMyA9IGFbMTFdO1xuXG4gICAgICAgIG91dFswXSA9IGEwMDsgb3V0WzFdID0gYTAxOyBvdXRbMl0gPSBhMDI7IG91dFszXSA9IGEwMztcbiAgICAgICAgb3V0WzRdID0gYTEwOyBvdXRbNV0gPSBhMTE7IG91dFs2XSA9IGExMjsgb3V0WzddID0gYTEzO1xuICAgICAgICBvdXRbOF0gPSBhMjA7IG91dFs5XSA9IGEyMTsgb3V0WzEwXSA9IGEyMjsgb3V0WzExXSA9IGEyMztcblxuICAgICAgICBvdXRbMTJdID0gYTAwICogeCArIGExMCAqIHkgKyBhMjAgKiB6ICsgYVsxMl07XG4gICAgICAgIG91dFsxM10gPSBhMDEgKiB4ICsgYTExICogeSArIGEyMSAqIHogKyBhWzEzXTtcbiAgICAgICAgb3V0WzE0XSA9IGEwMiAqIHggKyBhMTIgKiB5ICsgYTIyICogeiArIGFbMTRdO1xuICAgICAgICBvdXRbMTVdID0gYTAzICogeCArIGExMyAqIHkgKyBhMjMgKiB6ICsgYVsxNV07XG4gICAgfVxuXG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSB0cmFuc3Bvc2U7XG5cbi8qKlxuICogVHJhbnNwb3NlIHRoZSB2YWx1ZXMgb2YgYSBtYXQ0XG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0NH0gYSB0aGUgc291cmNlIG1hdHJpeFxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5mdW5jdGlvbiB0cmFuc3Bvc2Uob3V0LCBhKSB7XG4gICAgLy8gSWYgd2UgYXJlIHRyYW5zcG9zaW5nIG91cnNlbHZlcyB3ZSBjYW4gc2tpcCBhIGZldyBzdGVwcyBidXQgaGF2ZSB0byBjYWNoZSBzb21lIHZhbHVlc1xuICAgIGlmIChvdXQgPT09IGEpIHtcbiAgICAgICAgdmFyIGEwMSA9IGFbMV0sIGEwMiA9IGFbMl0sIGEwMyA9IGFbM10sXG4gICAgICAgICAgICBhMTIgPSBhWzZdLCBhMTMgPSBhWzddLFxuICAgICAgICAgICAgYTIzID0gYVsxMV07XG5cbiAgICAgICAgb3V0WzFdID0gYVs0XTtcbiAgICAgICAgb3V0WzJdID0gYVs4XTtcbiAgICAgICAgb3V0WzNdID0gYVsxMl07XG4gICAgICAgIG91dFs0XSA9IGEwMTtcbiAgICAgICAgb3V0WzZdID0gYVs5XTtcbiAgICAgICAgb3V0WzddID0gYVsxM107XG4gICAgICAgIG91dFs4XSA9IGEwMjtcbiAgICAgICAgb3V0WzldID0gYTEyO1xuICAgICAgICBvdXRbMTFdID0gYVsxNF07XG4gICAgICAgIG91dFsxMl0gPSBhMDM7XG4gICAgICAgIG91dFsxM10gPSBhMTM7XG4gICAgICAgIG91dFsxNF0gPSBhMjM7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgb3V0WzBdID0gYVswXTtcbiAgICAgICAgb3V0WzFdID0gYVs0XTtcbiAgICAgICAgb3V0WzJdID0gYVs4XTtcbiAgICAgICAgb3V0WzNdID0gYVsxMl07XG4gICAgICAgIG91dFs0XSA9IGFbMV07XG4gICAgICAgIG91dFs1XSA9IGFbNV07XG4gICAgICAgIG91dFs2XSA9IGFbOV07XG4gICAgICAgIG91dFs3XSA9IGFbMTNdO1xuICAgICAgICBvdXRbOF0gPSBhWzJdO1xuICAgICAgICBvdXRbOV0gPSBhWzZdO1xuICAgICAgICBvdXRbMTBdID0gYVsxMF07XG4gICAgICAgIG91dFsxMV0gPSBhWzE0XTtcbiAgICAgICAgb3V0WzEyXSA9IGFbM107XG4gICAgICAgIG91dFsxM10gPSBhWzddO1xuICAgICAgICBvdXRbMTRdID0gYVsxMV07XG4gICAgICAgIG91dFsxNV0gPSBhWzE1XTtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIG91dDtcbn07IiwiXG52YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi9saWIvZXh0ZW5kJylcbnZhciBnZXRDb250ZXh0ID0gcmVxdWlyZSgnLi9saWIvY29udGV4dCcpXG52YXIgY3JlYXRlU3RyaW5nU3RvcmUgPSByZXF1aXJlKCcuL2xpYi9zdHJpbmdzJylcbnZhciB3cmFwRXh0ZW5zaW9ucyA9IHJlcXVpcmUoJy4vbGliL2V4dGVuc2lvbicpXG52YXIgd3JhcExpbWl0cyA9IHJlcXVpcmUoJy4vbGliL2xpbWl0cycpXG52YXIgd3JhcEJ1ZmZlcnMgPSByZXF1aXJlKCcuL2xpYi9idWZmZXInKVxudmFyIHdyYXBFbGVtZW50cyA9IHJlcXVpcmUoJy4vbGliL2VsZW1lbnRzJylcbnZhciB3cmFwVGV4dHVyZXMgPSByZXF1aXJlKCcuL2xpYi90ZXh0dXJlJylcbnZhciB3cmFwUmVuZGVyYnVmZmVycyA9IHJlcXVpcmUoJy4vbGliL3JlbmRlcmJ1ZmZlcicpXG52YXIgd3JhcEZyYW1lYnVmZmVycyA9IHJlcXVpcmUoJy4vbGliL2ZyYW1lYnVmZmVyJylcbnZhciB3cmFwVW5pZm9ybXMgPSByZXF1aXJlKCcuL2xpYi91bmlmb3JtJylcbnZhciB3cmFwQXR0cmlidXRlcyA9IHJlcXVpcmUoJy4vbGliL2F0dHJpYnV0ZScpXG52YXIgd3JhcFNoYWRlcnMgPSByZXF1aXJlKCcuL2xpYi9zaGFkZXInKVxudmFyIHdyYXBEcmF3ID0gcmVxdWlyZSgnLi9saWIvZHJhdycpXG52YXIgd3JhcENvbnRleHQgPSByZXF1aXJlKCcuL2xpYi9zdGF0ZScpXG52YXIgY3JlYXRlQ29tcGlsZXIgPSByZXF1aXJlKCcuL2xpYi9jb21waWxlJylcbnZhciB3cmFwUmVhZCA9IHJlcXVpcmUoJy4vbGliL3JlYWQnKVxudmFyIGR5bmFtaWMgPSByZXF1aXJlKCcuL2xpYi9keW5hbWljJylcbnZhciByYWYgPSByZXF1aXJlKCcuL2xpYi9yYWYnKVxudmFyIGNsb2NrID0gcmVxdWlyZSgnLi9saWIvY2xvY2snKVxuXG52YXIgR0xfQ09MT1JfQlVGRkVSX0JJVCA9IDE2Mzg0XG52YXIgR0xfREVQVEhfQlVGRkVSX0JJVCA9IDI1NlxudmFyIEdMX1NURU5DSUxfQlVGRkVSX0JJVCA9IDEwMjRcblxudmFyIEdMX0FSUkFZX0JVRkZFUiA9IDM0OTYyXG52YXIgR0xfVEVYVFVSRV8yRCA9IDB4MERFMVxudmFyIEdMX1RFWFRVUkVfQ1VCRV9NQVAgPSAweDg1MTNcblxudmFyIENPTlRFWFRfTE9TVF9FVkVOVCA9ICd3ZWJnbGNvbnRleHRsb3N0J1xudmFyIENPTlRFWFRfUkVTVE9SRURfRVZFTlQgPSAnd2ViZ2xjb250ZXh0cmVzdG9yZWQnXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcFJFR0wgKCkge1xuICB2YXIgYXJncyA9IGdldENvbnRleHQoQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKSlcbiAgdmFyIGdsID0gYXJncy5nbFxuICB2YXIgb3B0aW9ucyA9IGFyZ3Mub3B0aW9uc1xuXG4gIC8vIFVzZSBzdHJpbmcgc3RvcmUgdG8gdHJhY2sgc3RyaW5nIGlkc1xuICB2YXIgc3RyaW5nU3RvcmUgPSBjcmVhdGVTdHJpbmdTdG9yZSgpXG5cbiAgdmFyIGV4dGVuc2lvblN0YXRlID0gd3JhcEV4dGVuc2lvbnMoZ2wpXG4gIHZhciBleHRlbnNpb25zID0gZXh0ZW5zaW9uU3RhdGUuZXh0ZW5zaW9uc1xuXG4gIHZhciB2aWV3cG9ydFN0YXRlID0ge1xuICAgIHdpZHRoOiBnbC5kcmF3aW5nQnVmZmVyV2lkdGgsXG4gICAgaGVpZ2h0OiBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0XG4gIH1cblxuICB2YXIgbGltaXRzID0gd3JhcExpbWl0cyhcbiAgICBnbCxcbiAgICBleHRlbnNpb25zKVxuXG4gIHZhciBidWZmZXJTdGF0ZSA9IHdyYXBCdWZmZXJzKGdsKVxuXG4gIHZhciBlbGVtZW50U3RhdGUgPSB3cmFwRWxlbWVudHMoXG4gICAgZ2wsXG4gICAgZXh0ZW5zaW9ucyxcbiAgICBidWZmZXJTdGF0ZSlcblxuICB2YXIgdW5pZm9ybVN0YXRlID0gd3JhcFVuaWZvcm1zKHN0cmluZ1N0b3JlKVxuXG4gIHZhciBhdHRyaWJ1dGVTdGF0ZSA9IHdyYXBBdHRyaWJ1dGVzKFxuICAgIGdsLFxuICAgIGV4dGVuc2lvbnMsXG4gICAgbGltaXRzLFxuICAgIGJ1ZmZlclN0YXRlLFxuICAgIHN0cmluZ1N0b3JlKVxuXG4gIHZhciBzaGFkZXJTdGF0ZSA9IHdyYXBTaGFkZXJzKFxuICAgIGdsLFxuICAgIGF0dHJpYnV0ZVN0YXRlLFxuICAgIHVuaWZvcm1TdGF0ZSxcbiAgICBmdW5jdGlvbiAocHJvZ3JhbSkge1xuICAgICAgcmV0dXJuIGNvbXBpbGVyLmRyYXcocHJvZ3JhbSlcbiAgICB9LFxuICAgIHN0cmluZ1N0b3JlKVxuXG4gIHZhciBkcmF3U3RhdGUgPSB3cmFwRHJhdyhcbiAgICBnbCxcbiAgICBleHRlbnNpb25zLFxuICAgIGJ1ZmZlclN0YXRlKVxuXG4gIHZhciB0ZXh0dXJlU3RhdGUgPSB3cmFwVGV4dHVyZXMoXG4gICAgZ2wsXG4gICAgZXh0ZW5zaW9ucyxcbiAgICBsaW1pdHMsXG4gICAgcG9sbCxcbiAgICB2aWV3cG9ydFN0YXRlKVxuXG4gIHZhciByZW5kZXJidWZmZXJTdGF0ZSA9IHdyYXBSZW5kZXJidWZmZXJzKFxuICAgIGdsLFxuICAgIGV4dGVuc2lvbnMsXG4gICAgbGltaXRzKVxuXG4gIHZhciBmcmFtZWJ1ZmZlclN0YXRlID0gd3JhcEZyYW1lYnVmZmVycyhcbiAgICBnbCxcbiAgICBleHRlbnNpb25zLFxuICAgIGxpbWl0cyxcbiAgICB0ZXh0dXJlU3RhdGUsXG4gICAgcmVuZGVyYnVmZmVyU3RhdGUpXG5cbiAgdmFyIGZyYW1lU3RhdGUgPSB7XG4gICAgY291bnQ6IDAsXG4gICAgc3RhcnQ6IGNsb2NrKCksXG4gICAgZHQ6IDAsXG4gICAgdDogY2xvY2soKSxcbiAgICByZW5kZXJUaW1lOiAwLFxuICAgIHdpZHRoOiBnbC5kcmF3aW5nQnVmZmVyV2lkdGgsXG4gICAgaGVpZ2h0OiBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0LFxuICAgIHBpeGVsUmF0aW86IG9wdGlvbnMucGl4ZWxSYXRpb1xuICB9XG5cbiAgdmFyIGdsU3RhdGUgPSB3cmFwQ29udGV4dChcbiAgICBnbCxcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLFxuICAgIHZpZXdwb3J0U3RhdGUpXG5cbiAgdmFyIHJlYWRQaXhlbHMgPSB3cmFwUmVhZChnbCwgcG9sbCwgdmlld3BvcnRTdGF0ZSlcblxuICB2YXIgY29tcGlsZXIgPSBjcmVhdGVDb21waWxlcihcbiAgICBnbCxcbiAgICBzdHJpbmdTdG9yZSxcbiAgICBleHRlbnNpb25zLFxuICAgIGxpbWl0cyxcbiAgICBidWZmZXJTdGF0ZSxcbiAgICBlbGVtZW50U3RhdGUsXG4gICAgdGV4dHVyZVN0YXRlLFxuICAgIGZyYW1lYnVmZmVyU3RhdGUsXG4gICAgZ2xTdGF0ZSxcbiAgICB1bmlmb3JtU3RhdGUsXG4gICAgYXR0cmlidXRlU3RhdGUsXG4gICAgc2hhZGVyU3RhdGUsXG4gICAgZHJhd1N0YXRlLFxuICAgIGZyYW1lU3RhdGUsXG4gICAgcG9sbClcblxuICB2YXIgY2FudmFzID0gZ2wuY2FudmFzXG5cbiAgLy8gcmFmIHN0dWZmXG4gIHZhciByYWZDYWxsYmFja3MgPSBbXVxuICB2YXIgYWN0aXZlUkFGID0gMFxuICBmdW5jdGlvbiBoYW5kbGVSQUYgKCkge1xuICAgIGFjdGl2ZVJBRiA9IHJhZi5uZXh0KGhhbmRsZVJBRilcbiAgICBmcmFtZVN0YXRlLmNvdW50ICs9IDFcblxuICAgIGlmIChmcmFtZVN0YXRlLndpZHRoICE9PSBnbC5kcmF3aW5nQnVmZmVyV2lkdGggfHxcbiAgICAgICAgZnJhbWVTdGF0ZS5oZWlnaHQgIT09IGdsLmRyYXdpbmdCdWZmZXJIZWlnaHQpIHtcbiAgICAgIGZyYW1lU3RhdGUud2lkdGggPSBnbC5kcmF3aW5nQnVmZmVyV2lkdGhcbiAgICAgIGZyYW1lU3RhdGUuaGVpZ2h0ID0gZ2wuZHJhd2luZ0J1ZmZlckhlaWdodFxuICAgICAgZ2xTdGF0ZS5ub3RpZnlWaWV3cG9ydENoYW5nZWQoKVxuICAgIH1cblxuICAgIHZhciBub3cgPSBjbG9jaygpXG4gICAgZnJhbWVTdGF0ZS5kdCA9IG5vdyAtIGZyYW1lU3RhdGUudFxuICAgIGZyYW1lU3RhdGUudCA9IG5vd1xuXG4gICAgdGV4dHVyZVN0YXRlLnBvbGwoKVxuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCByYWZDYWxsYmFja3MubGVuZ3RoOyArK2kpIHtcbiAgICAgIHZhciBjYiA9IHJhZkNhbGxiYWNrc1tpXVxuICAgICAgY2IoZnJhbWVTdGF0ZS5jb3VudCwgZnJhbWVTdGF0ZS50LCBmcmFtZVN0YXRlLmR0KVxuICAgIH1cbiAgICBmcmFtZVN0YXRlLnJlbmRlclRpbWUgPSBjbG9jaygpIC0gbm93XG4gIH1cblxuICBmdW5jdGlvbiBzdGFydFJBRiAoKSB7XG4gICAgaWYgKCFhY3RpdmVSQUYgJiYgcmFmQ2FsbGJhY2tzLmxlbmd0aCA+IDApIHtcbiAgICAgIGhhbmRsZVJBRigpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc3RvcFJBRiAoKSB7XG4gICAgaWYgKGFjdGl2ZVJBRikge1xuICAgICAgcmFmLmNhbmNlbChoYW5kbGVSQUYpXG4gICAgICBhY3RpdmVSQUYgPSAwXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlQ29udGV4dExvc3MgKGV2ZW50KSB7XG4gICAgc3RvcFJBRigpXG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxuICAgIGlmIChvcHRpb25zLm9uQ29udGV4dExvc3QpIHtcbiAgICAgIG9wdGlvbnMub25Db250ZXh0TG9zdCgpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlQ29udGV4dFJlc3RvcmVkIChldmVudCkge1xuICAgIGdsLmdldEVycm9yKClcbiAgICBleHRlbnNpb25TdGF0ZS5yZWZyZXNoKClcbiAgICBidWZmZXJTdGF0ZS5yZWZyZXNoKClcbiAgICB0ZXh0dXJlU3RhdGUucmVmcmVzaCgpXG4gICAgcmVuZGVyYnVmZmVyU3RhdGUucmVmcmVzaCgpXG4gICAgZnJhbWVidWZmZXJTdGF0ZS5yZWZyZXNoKClcbiAgICBzaGFkZXJTdGF0ZS5yZWZyZXNoKClcbiAgICBnbFN0YXRlLnJlZnJlc2goKVxuICAgIGlmIChvcHRpb25zLm9uQ29udGV4dFJlc3RvcmVkKSB7XG4gICAgICBvcHRpb25zLm9uQ29udGV4dFJlc3RvcmVkKClcbiAgICB9XG4gICAgaGFuZGxlUkFGKClcbiAgfVxuXG4gIGlmIChjYW52YXMpIHtcbiAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihDT05URVhUX0xPU1RfRVZFTlQsIGhhbmRsZUNvbnRleHRMb3NzLCBmYWxzZSlcbiAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihDT05URVhUX1JFU1RPUkVEX0VWRU5ULCBoYW5kbGVDb250ZXh0UmVzdG9yZWQsIGZhbHNlKVxuICB9XG5cbiAgLy8gUmVzb3VyY2UgZGVzdHJ1Y3R1aW9uXG4gIGZ1bmN0aW9uIGRlc3Ryb3kgKCkge1xuICAgIHN0b3BSQUYoKVxuXG4gICAgaWYgKGNhbnZhcykge1xuICAgICAgY2FudmFzLnJlbW92ZUV2ZW50TGlzdGVuZXIoQ09OVEVYVF9MT1NUX0VWRU5ULCBoYW5kbGVDb250ZXh0TG9zcylcbiAgICAgIGNhbnZhcy5yZW1vdmVFdmVudExpc3RlbmVyKENPTlRFWFRfUkVTVE9SRURfRVZFTlQsIGhhbmRsZUNvbnRleHRSZXN0b3JlZClcbiAgICB9XG5cbiAgICBzaGFkZXJTdGF0ZS5jbGVhcigpXG4gICAgZnJhbWVidWZmZXJTdGF0ZS5jbGVhcigpXG4gICAgcmVuZGVyYnVmZmVyU3RhdGUuY2xlYXIoKVxuICAgIHRleHR1cmVTdGF0ZS5jbGVhcigpXG4gICAgYnVmZmVyU3RhdGUuY2xlYXIoKVxuXG4gICAgaWYgKG9wdGlvbnMub25EZXN0cm95KSB7XG4gICAgICBvcHRpb25zLm9uRGVzdHJveSgpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gY29tcGlsZVByb2NlZHVyZSAob3B0aW9ucykge1xuICAgIFxuICAgIFxuXG4gICAgdmFyIGhhc0R5bmFtaWMgPSBmYWxzZVxuXG4gICAgZnVuY3Rpb24gZmxhdHRlbk5lc3RlZE9wdGlvbnMgKG9wdGlvbnMpIHtcbiAgICAgIHZhciByZXN1bHQgPSBleHRlbmQoe30sIG9wdGlvbnMpXG4gICAgICBkZWxldGUgcmVzdWx0LnVuaWZvcm1zXG4gICAgICBkZWxldGUgcmVzdWx0LmF0dHJpYnV0ZXNcblxuICAgICAgZnVuY3Rpb24gbWVyZ2UgKG5hbWUpIHtcbiAgICAgICAgaWYgKG5hbWUgaW4gcmVzdWx0KSB7XG4gICAgICAgICAgdmFyIGNoaWxkID0gcmVzdWx0W25hbWVdXG4gICAgICAgICAgZGVsZXRlIHJlc3VsdFtuYW1lXVxuICAgICAgICAgIE9iamVjdC5rZXlzKGNoaWxkKS5mb3JFYWNoKGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgICAgICAgICByZXN1bHRbbmFtZSArICcuJyArIHByb3BdID0gY2hpbGRbcHJvcF1cbiAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBtZXJnZSgnYmxlbmQnKVxuICAgICAgbWVyZ2UoJ2RlcHRoJylcbiAgICAgIG1lcmdlKCdjdWxsJylcbiAgICAgIG1lcmdlKCdzdGVuY2lsJylcbiAgICAgIG1lcmdlKCdwb2x5Z29uT2Zmc2V0JylcbiAgICAgIG1lcmdlKCdzY2lzc29yJylcbiAgICAgIG1lcmdlKCdzYW1wbGUnKVxuXG4gICAgICByZXR1cm4gcmVzdWx0XG4gICAgfVxuXG4gICAgLy8gRmlyc3Qgd2Ugc2VwYXJhdGUgdGhlIG9wdGlvbnMgaW50byBzdGF0aWMgYW5kIGR5bmFtaWMgY29tcG9uZW50c1xuICAgIGZ1bmN0aW9uIHNlcGFyYXRlRHluYW1pYyAob2JqZWN0KSB7XG4gICAgICB2YXIgc3RhdGljSXRlbXMgPSB7fVxuICAgICAgdmFyIGR5bmFtaWNJdGVtcyA9IHt9XG4gICAgICBPYmplY3Qua2V5cyhvYmplY3QpLmZvckVhY2goZnVuY3Rpb24gKG9wdGlvbikge1xuICAgICAgICB2YXIgdmFsdWUgPSBvYmplY3Rbb3B0aW9uXVxuICAgICAgICBpZiAoZHluYW1pYy5pc0R5bmFtaWModmFsdWUpKSB7XG4gICAgICAgICAgaGFzRHluYW1pYyA9IHRydWVcbiAgICAgICAgICBkeW5hbWljSXRlbXNbb3B0aW9uXSA9IGR5bmFtaWMudW5ib3godmFsdWUsIG9wdGlvbilcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdGF0aWNJdGVtc1tvcHRpb25dID0gdmFsdWVcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGR5bmFtaWM6IGR5bmFtaWNJdGVtcyxcbiAgICAgICAgc3RhdGljOiBzdGF0aWNJdGVtc1xuICAgICAgfVxuICAgIH1cblxuICAgIHZhciB1bmlmb3JtcyA9IHNlcGFyYXRlRHluYW1pYyhvcHRpb25zLnVuaWZvcm1zIHx8IHt9KVxuICAgIHZhciBhdHRyaWJ1dGVzID0gc2VwYXJhdGVEeW5hbWljKG9wdGlvbnMuYXR0cmlidXRlcyB8fCB7fSlcbiAgICB2YXIgb3B0cyA9IHNlcGFyYXRlRHluYW1pYyhmbGF0dGVuTmVzdGVkT3B0aW9ucyhvcHRpb25zKSlcblxuICAgIHZhciBjb21waWxlZCA9IGNvbXBpbGVyLmNvbW1hbmQoXG4gICAgICBvcHRzLnN0YXRpYywgdW5pZm9ybXMuc3RhdGljLCBhdHRyaWJ1dGVzLnN0YXRpYyxcbiAgICAgIG9wdHMuZHluYW1pYywgdW5pZm9ybXMuZHluYW1pYywgYXR0cmlidXRlcy5keW5hbWljLFxuICAgICAgaGFzRHluYW1pYylcblxuICAgIHZhciBkcmF3ID0gY29tcGlsZWQuZHJhd1xuICAgIHZhciBiYXRjaCA9IGNvbXBpbGVkLmJhdGNoXG4gICAgdmFyIHNjb3BlID0gY29tcGlsZWQuc2NvcGVcblxuICAgIHZhciBFTVBUWV9BUlJBWSA9IFtdXG4gICAgZnVuY3Rpb24gcmVzZXJ2ZSAoY291bnQpIHtcbiAgICAgIHdoaWxlIChFTVBUWV9BUlJBWS5sZW5ndGggPCBjb3VudCkge1xuICAgICAgICBFTVBUWV9BUlJBWS5wdXNoKG51bGwpXG4gICAgICB9XG4gICAgICByZXR1cm4gRU1QVFlfQVJSQVlcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBSRUdMQ29tbWFuZCAoYXJncywgYm9keSkge1xuICAgICAgaWYgKHR5cGVvZiBhcmdzID09PSAnbnVtYmVyJykge1xuICAgICAgICByZXR1cm4gYmF0Y2goYXJncyB8IDAsIHJlc2VydmUoYXJncyB8IDApKVxuICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGFyZ3MpKSB7XG4gICAgICAgIHJldHVybiBiYXRjaChhcmdzLmxlbmd0aCwgYXJncylcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGFyZ3MgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgcmV0dXJuIHNjb3BlKG51bGwsIGFyZ3MpXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBib2R5ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHJldHVybiBzY29wZShhcmdzLCBib2R5KVxuICAgICAgfVxuICAgICAgcmV0dXJuIGRyYXcoYXJncylcbiAgICB9XG5cbiAgICByZXR1cm4gUkVHTENvbW1hbmRcbiAgfVxuXG4gIGZ1bmN0aW9uIHBvbGwgKCkge1xuICAgIGZyYW1lYnVmZmVyU3RhdGUucG9sbCgpXG4gICAgZ2xTdGF0ZS5wb2xsKClcbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFyIChvcHRpb25zKSB7XG4gICAgdmFyIGNsZWFyRmxhZ3MgPSAwXG5cbiAgICAvLyBVcGRhdGUgY29udGV4dCBzdGF0ZVxuICAgIHBvbGwoKVxuXG4gICAgdmFyIGMgPSBvcHRpb25zLmNvbG9yXG4gICAgaWYgKGMpIHtcbiAgICAgIGdsLmNsZWFyQ29sb3IoK2NbMF0gfHwgMCwgK2NbMV0gfHwgMCwgK2NbMl0gfHwgMCwgK2NbM10gfHwgMClcbiAgICAgIGNsZWFyRmxhZ3MgfD0gR0xfQ09MT1JfQlVGRkVSX0JJVFxuICAgIH1cbiAgICBpZiAoJ2RlcHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICBnbC5jbGVhckRlcHRoKCtvcHRpb25zLmRlcHRoKVxuICAgICAgY2xlYXJGbGFncyB8PSBHTF9ERVBUSF9CVUZGRVJfQklUXG4gICAgfVxuICAgIGlmICgnc3RlbmNpbCcgaW4gb3B0aW9ucykge1xuICAgICAgZ2wuY2xlYXJTdGVuY2lsKG9wdGlvbnMuc3RlbmNpbCB8IDApXG4gICAgICBjbGVhckZsYWdzIHw9IEdMX1NURU5DSUxfQlVGRkVSX0JJVFxuICAgIH1cblxuICAgIFxuICAgIGdsLmNsZWFyKGNsZWFyRmxhZ3MpXG4gIH1cblxuICAvLyBSZWdpc3RlcnMgYW5vdGhlciByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgY2FsbGJhY2tcbiAgZnVuY3Rpb24gZnJhbWUgKGNiKSB7XG4gICAgcmFmQ2FsbGJhY2tzLnB1c2goY2IpXG5cbiAgICBmdW5jdGlvbiBjYW5jZWwgKCkge1xuICAgICAgdmFyIGluZGV4ID0gcmFmQ2FsbGJhY2tzLmZpbmQoZnVuY3Rpb24gKGl0ZW0pIHtcbiAgICAgICAgcmV0dXJuIGl0ZW0gPT09IGNiXG4gICAgICB9KVxuICAgICAgaWYgKGluZGV4IDwgMCkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIHJhZkNhbGxiYWNrcy5zcGxpY2UoaW5kZXgsIDEpXG4gICAgICBpZiAocmFmQ2FsbGJhY2tzLmxlbmd0aCA8PSAwKSB7XG4gICAgICAgIHN0b3BSQUYoKVxuICAgICAgfVxuICAgIH1cblxuICAgIHN0YXJ0UkFGKClcblxuICAgIHJldHVybiB7XG4gICAgICBjYW5jZWw6IGNhbmNlbFxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBleHRlbmQoY29tcGlsZVByb2NlZHVyZSwge1xuICAgIC8vIENsZWFyIGN1cnJlbnQgRkJPXG4gICAgY2xlYXI6IGNsZWFyLFxuXG4gICAgLy8gU2hvcnQgY3V0IGZvciBwcm9wIGJpbmRpbmdcbiAgICBwcm9wOiBkeW5hbWljLmRlZmluZSxcblxuICAgIC8vIGV4ZWN1dGVzIGFuIGVtcHR5IGRyYXcgY29tbWFuZFxuICAgIGRyYXc6IGNvbXBpbGVQcm9jZWR1cmUoe30pLFxuXG4gICAgLy8gUmVzb3VyY2VzXG4gICAgZWxlbWVudHM6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICByZXR1cm4gZWxlbWVudFN0YXRlLmNyZWF0ZShvcHRpb25zKVxuICAgIH0sXG4gICAgYnVmZmVyOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgcmV0dXJuIGJ1ZmZlclN0YXRlLmNyZWF0ZShvcHRpb25zLCBHTF9BUlJBWV9CVUZGRVIpXG4gICAgfSxcbiAgICB0ZXh0dXJlOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgcmV0dXJuIHRleHR1cmVTdGF0ZS5jcmVhdGUob3B0aW9ucywgR0xfVEVYVFVSRV8yRClcbiAgICB9LFxuICAgIGN1YmU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gNikge1xuICAgICAgICByZXR1cm4gdGV4dHVyZVN0YXRlLmNyZWF0ZShcbiAgICAgICAgICBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpLFxuICAgICAgICAgIEdMX1RFWFRVUkVfQ1VCRV9NQVApXG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gdGV4dHVyZVN0YXRlLmNyZWF0ZShvcHRpb25zLCBHTF9URVhUVVJFX0NVQkVfTUFQKVxuICAgICAgfVxuICAgIH0sXG4gICAgcmVuZGVyYnVmZmVyOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgcmV0dXJuIHJlbmRlcmJ1ZmZlclN0YXRlLmNyZWF0ZShvcHRpb25zKVxuICAgIH0sXG4gICAgZnJhbWVidWZmZXI6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICByZXR1cm4gZnJhbWVidWZmZXJTdGF0ZS5jcmVhdGUob3B0aW9ucylcbiAgICB9LFxuICAgIGZyYW1lYnVmZmVyQ3ViZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIFxuICAgIH0sXG5cbiAgICAvLyBGcmFtZSByZW5kZXJpbmdcbiAgICBmcmFtZTogZnJhbWUsXG4gICAgc3RhdHM6IGZyYW1lU3RhdGUsXG5cbiAgICAvLyBTeXN0ZW0gbGltaXRzXG4gICAgbGltaXRzOiBsaW1pdHMsXG5cbiAgICAvLyBSZWFkIHBpeGVsc1xuICAgIHJlYWQ6IHJlYWRQaXhlbHMsXG5cbiAgICAvLyBEZXN0cm95IHJlZ2wgYW5kIGFsbCBhc3NvY2lhdGVkIHJlc291cmNlc1xuICAgIGRlc3Ryb3k6IGRlc3Ryb3lcbiAgfSlcbn1cbiJdfQ==