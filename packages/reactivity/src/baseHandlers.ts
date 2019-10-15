import { reactive, readonly, toRaw } from './reactive'
import { OperationTypes } from './operations' // 操作类型
import { track, trigger } from './effect' // 追踪方法
import { LOCKED } from './lock'
// 基础方法，判断是否是对象，是否自身有的属性，是否是 symbol
import { isObject, hasOwn, isSymbol } from '@vue/shared'
import { isRef } from './ref' // 判断是否是 ref 类型

/* 
  创建一个Set，里面是该对象所有内置的 Symbol
*/
const builtInSymbols = new Set(
  Object.getOwnPropertyNames(Symbol)
    .map(key => (Symbol as any)[key])
    .filter(isSymbol)
)

// 创建getter函数的高阶函数，通过 isReadonly 来决定 mutable 或者 readonly
function createGetter(isReadonly: boolean) {
  // 返回一个函数
  return function get(target: any, key: string | symbol, receiver: any) {
    // Refect.get()方法查找并返回target对象的key属性，】
    // 如果没有该属性，则返回undefined。
    // 如果key属性部署了读取函数（getter），则读取函数的this绑定receiver。
    const res = Reflect.get(target, key, receiver)
    // 如果是symbol类型 或者 builtInSymbols里有这个变量，直接返回
    if (isSymbol(key) && builtInSymbols.has(key)) {
      return res
    }
    // 如果 ref 类型，就取 value， 自动 unwrap
    if (isRef(res)) {
      return res.value
    }
    // 当取值时，追踪其变化，
    track(target, OperationTypes.GET, key)
    return isObject(res)
      ? isReadonly
        ? // 需要在这里延迟 只读和响应式的获取，以避免循环依赖
          readonly(res)
        : reactive(res)
      : res
  }
}

// 设置属性的方法
function set(
  target: any, // 目标对象
  key: string | symbol, // 属性
  value: any, // 值
  receiver: any // 用来接收 setter
): boolean {
  // 把value转成 raw
  value = toRaw(value)
  // 判断target里是否有key属性
  const hadKey = hasOwn(target, key)
  // 取出以前值
  const oldValue = target[key]
  // 如果以前的值是ref，且新的value不是ref，就把新的值赋值给旧值的value,
  // 并直接返回true
  if (isRef(oldValue) && !isRef(value)) {
    oldValue.value = value
    return true
  }
  // 旧值非ref或新值是ref的情况下
  // 设置target对象的key属性等于value，
  // 如果key属性有setter函数，就把赋值函数的this绑定给receiver
  const result = Reflect.set(target, key, value, receiver)
  // 如果 target 是原型链上的某个对象，则不触发
  if (target === toRaw(receiver)) {
    // 根据hadKey 来判断是 添加还是设置操作，
    if (__DEV__) {
      // 开发模式添加多的信息
      const extraInfo = { oldValue, newValue: value }
      if (!hadKey) {
        trigger(target, OperationTypes.ADD, key, extraInfo)
      } else if (value !== oldValue) {
        trigger(target, OperationTypes.SET, key, extraInfo)
      }
    } else {
      if (!hadKey) {
        trigger(target, OperationTypes.ADD, key)
      } else if (value !== oldValue) {
        trigger(target, OperationTypes.SET, key)
      }
    }
  }
  return result
}

function deleteProperty(target: any, key: string | symbol): boolean {
  const hadKey = hasOwn(target, key)
  const oldValue = target[key]
  const result = Reflect.deleteProperty(target, key)
  if (result && hadKey) {
    /* istanbul ignore else */
    if (__DEV__) {
      trigger(target, OperationTypes.DELETE, key, { oldValue })
    } else {
      trigger(target, OperationTypes.DELETE, key)
    }
  }
  return result
}

function has(target: any, key: string | symbol): boolean {
  const result = Reflect.has(target, key)
  track(target, OperationTypes.HAS, key)
  return result
}

function ownKeys(target: any): (string | number | symbol)[] {
  track(target, OperationTypes.ITERATE)
  return Reflect.ownKeys(target)
}
// 可以编辑的处理方法
export const mutableHandlers: ProxyHandler<any> = {
  get: createGetter(false),
  set,
  deleteProperty,
  has,
  ownKeys
}
// 只读的处理方法
export const readonlyHandlers: ProxyHandler<any> = {
  get: createGetter(true),

  set(target: any, key: string | symbol, value: any, receiver: any): boolean {
    if (LOCKED) {
      if (__DEV__) {
        console.warn(
          `Set operation on key "${String(key)}" failed: target is readonly.`,
          target
        )
      }
      return true
    } else {
      return set(target, key, value, receiver)
    }
  },

  deleteProperty(target: any, key: string | symbol): boolean {
    if (LOCKED) {
      if (__DEV__) {
        console.warn(
          `Delete operation on key "${String(
            key
          )}" failed: target is readonly.`,
          target
        )
      }
      return true
    } else {
      return deleteProperty(target, key)
    }
  },

  has,
  ownKeys
}
