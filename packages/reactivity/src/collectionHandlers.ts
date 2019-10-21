/*
  单独处理 Set|Map|WeakMap|WeakSet 这几个数据类型
*/
// 转成原始数据，变成reactive数据，只读判断
import { toRaw, reactive, readonly } from './reactive'
// 追踪和触发方法
import { track, trigger } from './effect'
// 操作类型
import { OperationTypes } from './operations'
import { LOCKED } from './lock' // 是否锁定
import { isObject, capitalize, hasOwn } from '@vue/shared'

// 把数据变成响应式的
const toReactive = (value: any) => (isObject(value) ? reactive(value) : value)
// 把数据变成只读的
const toReadonly = (value: any) => (isObject(value) ? readonly(value) : value)

// get方法
function get(target: any, key: any, wrap: (t: any) => any): any {
  // 获取原始数据
  target = toRaw(target)
  // 由于Map可以用对象做key，所以key也有可能是个响应式数据，先转为原始数据
  key = toRaw(key)
  // 读取target的__proto__属性
  const proto: any = Reflect.getPrototypeOf(target)
  // 收集依赖
  track(target, OperationTypes.GET, key)
  // 使用原型方法，通过原始数据去获得该key的值。
  const res = proto.get.call(target, key)
  // wrap 即传入的toReceive方法，将获取的value值转为响应式数据
  return wrap(res)
}

// 判断 target 是否有 key 属性
function has(this: any, key: any): boolean {
  const target = toRaw(this)
  key = toRaw(key)
  const proto: any = Reflect.getPrototypeOf(target)
  track(target, OperationTypes.HAS, key)
  return proto.has.call(target, key)
}

// 返回 target 的 size 属性
function size(target: any) {
  target = toRaw(target)
  const proto = Reflect.getPrototypeOf(target)
  track(target, OperationTypes.ITERATE)
  return Reflect.get(proto, 'size', target)
}

// 给 target 添加 value 值
function add(this: any, value: any) {
  value = toRaw(value)
  const target = toRaw(this)
  const proto: any = Reflect.getPrototypeOf(this)
  const hadKey = proto.has.call(target, value)
  const result = proto.add.call(target, value)
  if (!hadKey) {
    /* istanbul ignore else */
    if (__DEV__) {
      trigger(target, OperationTypes.ADD, value, { value })
    } else {
      trigger(target, OperationTypes.ADD, value)
    }
  }
  return result
}

// 给target的key属性添加value值
function set(this: any, key: any, value: any) {
  value = toRaw(value)
  const target = toRaw(this)
  const proto: any = Reflect.getPrototypeOf(this)
  const hadKey = proto.has.call(target, key)
  const oldValue = proto.get.call(target, key)
  const result = proto.set.call(target, key, value)
  if (value !== oldValue) {
    /* istanbul ignore else */
    if (__DEV__) {
      const extraInfo = { oldValue, newValue: value }
      if (!hadKey) {
        trigger(target, OperationTypes.ADD, key, extraInfo)
      } else {
        trigger(target, OperationTypes.SET, key, extraInfo)
      }
    } else {
      if (!hadKey) {
        trigger(target, OperationTypes.ADD, key)
      } else {
        trigger(target, OperationTypes.SET, key)
      }
    }
  }
  return result
}

// 删除入口
function deleteEntry(this: any, key: any) {
  const target = toRaw(this)
  const proto: any = Reflect.getPrototypeOf(this)
  const hadKey = proto.has.call(target, key)
  const oldValue = proto.get ? proto.get.call(target, key) : undefined
  // forward the operation before queueing reactions
  const result = proto.delete.call(target, key)
  if (hadKey) {
    /* istanbul ignore else */
    if (__DEV__) {
      trigger(target, OperationTypes.DELETE, key, { oldValue })
    } else {
      trigger(target, OperationTypes.DELETE, key)
    }
  }
  return result
}

function clear(this: any) {
  const target = toRaw(this)
  const proto: any = Reflect.getPrototypeOf(this)
  const hadItems = target.size !== 0
  const oldTarget = target instanceof Map ? new Map(target) : new Set(target)
  // forward the operation before queueing reactions
  const result = proto.clear.call(target)
  if (hadItems) {
    /* istanbul ignore else */
    if (__DEV__) {
      trigger(target, OperationTypes.CLEAR, void 0, { oldTarget })
    } else {
      trigger(target, OperationTypes.CLEAR)
    }
  }
  return result
}

// 劫持遍历方法
function createForEach(isReadonly: boolean) {
  // 这个this，我们已经知道了是假参数，也就是forEach的调用者
  return function forEach(this: any, callback: Function, thisArg?: any) {
    const observed = this
    const target = toRaw(observed)
    const proto: any = Reflect.getPrototypeOf(target)
    const wrap = isReadonly ? toReadonly : toReactive
    track(target, OperationTypes.ITERATE)
    // important: create sure the callback is
    // 1. invoked with the reactive map as `this` and 3rd arg
    // 2. the value received should be a corresponding reactive/readonly.
    // 将传递进来的callback方法插桩，让传入callback的数据，转为响应式数据
    function wrappedCallback(value: any, key: any) {
      // forEach使用的数据，转为响应式数据
      return callback.call(observed, wrap(value), wrap(key), observed)
    }
    return proto.forEach.call(target, wrappedCallback, thisArg)
  }
}

// 劫持迭代器方法
function createIterableMethod(method: string | symbol, isReadonly: boolean) {
  return function(this: any, ...args: any[]) {
    // 获取原始数据
    const target = toRaw(this)
    // 获取原型
    const proto: any = Reflect.getPrototypeOf(target)
    // 如果是entries方法，或者是map的迭代方法的话，isPair为true
    // 这种情况下，迭代器方法的返回的是一个[key, value]的结构
    const isPair =
      method === 'entries' ||
      (method === Symbol.iterator && target instanceof Map)
    // 调用原型链上的相应迭代器方法
    const innerIterator = proto[method].apply(target, args)
    // 获取相应的转成响应数据的方法
    const wrap = isReadonly ? toReadonly : toReactive
    // 收集依赖
    track(target, OperationTypes.ITERATE)
    // 给返回的innerIterator插桩，将其value值转为响应式数据
    return {
      // iterator protocol
      next() {
        const { value, done } = innerIterator.next()
        return done
          ? { value, done } // 为done的时候，value是最后一个值的next，是undefined，没必要做响应式转换了
          : {
              value: isPair ? [wrap(value[0]), wrap(value[1])] : wrap(value),
              done
            }
      },
      // iterable protocol
      [Symbol.iterator]() {
        return this
      }
    }
  }
}

// 生成只读对象的方法
function createReadonlyMethod(
  method: Function,
  type: OperationTypes
): Function {
  return function(this: any, ...args: any[]) {
    if (LOCKED) {
      if (__DEV__) {
        const key = args[0] ? `on key "${args[0]}" ` : ``
        console.warn(
          `${capitalize(type)} operation ${key}failed: target is readonly.`,
          toRaw(this)
        )
      }
      return type === OperationTypes.DELETE ? false : this
    } else {
      return method.apply(this, args)
    }
  }
}
// 可变数据插桩对象，以及一系列相应的插桩方法
const mutableInstrumentations: any = {
  get(key: any) {
    // this 上述Reflect.get(target, key, receiver)中的target，也即是原始数据
    // toReactive是一个将数据转为响应式数据的方法
    return get(this, key, toReactive)
  },
  get size() {
    return size(this)
  },
  has,
  add,
  set,
  delete: deleteEntry,
  clear,
  forEach: createForEach(false)
}

// 只读数据插桩对象，以及一系列相应的插桩方法
const readonlyInstrumentations: any = {
  get(key: any) {
    return get(this, key, toReadonly)
  },
  get size() {
    return size(this)
  },
  has,
  add: createReadonlyMethod(add, OperationTypes.ADD),
  set: createReadonlyMethod(set, OperationTypes.SET),
  delete: createReadonlyMethod(deleteEntry, OperationTypes.DELETE),
  clear: createReadonlyMethod(clear, OperationTypes.CLEAR),
  forEach: createForEach(true)
}
// 迭代器相关的方法
const iteratorMethods = ['keys', 'values', 'entries', Symbol.iterator]
iteratorMethods.forEach(method => {
  mutableInstrumentations[method] = createIterableMethod(method, false)
  readonlyInstrumentations[method] = createIterableMethod(method, true)
})

// 创建getter的函数
function createInstrumentationGetter(instrumentations: any) {
  // 返回一个被插桩后的get
  return function getInstrumented(
    target: any,
    key: string | symbol,
    receiver: any
  ) {
    // 如果有插桩对象中有此key，且目标对象也有此key，
    // 那就用这个插桩对象做反射get的对象，否则用原始对象
    target =
      hasOwn(instrumentations, key) && key in target ? instrumentations : target
    return Reflect.get(target, key, receiver)
  }
}
// 可变集合数据代理处理
export const mutableCollectionHandlers: ProxyHandler<any> = {
  // 只有get，set等方法会报错，内部存储的数据必须通过this来访问
  get: createInstrumentationGetter(mutableInstrumentations)
}
// 只读集合数据代理处理
export const readonlyCollectionHandlers: ProxyHandler<any> = {
  // 只有get，set等方法会报错，内部存储的数据必须通过this来访问
  get: createInstrumentationGetter(readonlyInstrumentations)
}
