import { isObject, toTypeString } from '@vue/shared' // 两个方法，一个判断是否是对象，一个是判断类型的方法
// 此处的handles最终会传递给Proxy(target, handle)的第二个参数
import { mutableHandlers, readonlyHandlers } from './baseHandlers'
// collections 指 Set, Map, WeakMap, WeakSet
import {
  mutableCollectionHandlers,
  readonlyCollectionHandlers
} from './collectionHandlers'
// 被effect执行后返回的监听函数的类型
import { ReactiveEffect } from './effect'
// 范型类型
import { UnwrapRef, Ref } from './ref'

// WeakMap 用爱储存 {target -> key -> dep } 的连接
// 理论上，依赖关系用类来维护更容易，但是这样做可以减少内存的开销
export type Dep = Set<ReactiveEffect>
export type KeyToDepMap = Map<string | symbol, Dep>
export const targetMap = new WeakMap<any, KeyToDepMap>()

// 用WeakMap 来储存 { raw <-> observed }(原始和处理过)的数据
const rawToReactive = new WeakMap<any, any>() // 原始数据转响应式
const reactiveToRaw = new WeakMap<any, any>() // 响应式转原始数据
const rawToReadonly = new WeakMap<any, any>() // 原始数据转只读
const readonlyToRaw = new WeakMap<any, any>() // 只读数据转原始数据

// 只读的值
const readonlyValues = new WeakSet<any>()
// 不被响应化的值
const nonReactiveValues = new WeakSet<any>()
// 声明集合的类型
const collectionTypes = new Set<Function>([Set, Map, WeakMap, WeakSet])
// 用于检测可以观察的值
// 用于正则判断是否符合可观察数据，object + array + collectionTypes
const observableValueRE = /^\[object (?:Object|Array|Map|Set|WeakMap|WeakSet)\]$/

// 判断一个值能不能被观察的方法
// 1.不是vue实例 2.不是 VNode实例 3. 符合observableValueRE，4.不是不能观察的值
const canObserve = (value: any): boolean => {
  return (
    !value._isVue &&
    !value._isVNode &&
    observableValueRE.test(toTypeString(value)) &&
    !nonReactiveValues.has(value)
  )
}

// 仅用于 unwrap 嵌套的ref类型
type UnwrapNestedRefs<T> = T extends Ref ? T : UnwrapRef<T>

export function reactive<T extends object>(target: T): UnwrapNestedRefs<T>
export function reactive(target: object) {
  // 如果 target 是 readonly的值就直接返回
  if (readonlyToRaw.has(target)) {
    return target
  }
  // 用户显式的标记为 readonly
  if (readonlyValues.has(target)) {
    return readonly(target)
  }
  // 创建一个响应式的对象
  return createReactiveObject(
    target,
    rawToReactive,
    reactiveToRaw,
    mutableHandlers,
    mutableCollectionHandlers
  )
}

// 把一个对象设置成只读
export function readonly<T extends object>(
  target: T
): Readonly<UnwrapNestedRefs<T>> {
  // target 可能已经被观察且是可变的，拿到原始的值并返回只读的版本
  if (reactiveToRaw.has(target)) {
    target = reactiveToRaw.get(target)
  }
  return createReactiveObject(
    target,
    rawToReadonly,
    readonlyToRaw,
    readonlyHandlers,
    readonlyCollectionHandlers
  )
}

// 创建一个响应式的对象
function createReactiveObject(
  target: any,
  toProxy: WeakMap<any, any>,
  toRaw: WeakMap<any, any>,
  baseHandlers: ProxyHandler<any>,
  collectionHandlers: ProxyHandler<any>
) {
  // 首先target必须是一个对象
  if (!isObject(target)) {
    if (__DEV__) {
      console.warn(`value cannot be made reactive: ${String(target)}`)
    }
    return target
  }
  // target 是observed前的数据，但是之前观察过，直接从缓存中取
  let observed = toProxy.get(target)
  if (observed !== void 0) {
    return observed
  }
  // target 本身就是observed过的数据
  if (toRaw.has(target)) {
    return target
  }
  // 只有 Object|Array|Map|Set|WeakMap|WeakSet 可以被观察
  if (!canObserve(target)) {
    return target
  }
  // 根据类型选择， 集合类 还是 普通的 proxy 处理函数
  const handlers = collectionTypes.has(target.constructor)
    ? collectionHandlers
    : baseHandlers
  // 把数据代理成proxy
  observed = new Proxy(target, handlers)
  // 缓存转换前后的数据
  toProxy.set(target, observed)
  toRaw.set(observed, target)
  // target 对应的依赖声明
  if (!targetMap.has(target)) {
    targetMap.set(target, new Map())
  }
  // 返回 观察后的数据
  return observed
}

// 判断是否是响应式的数据
export function isReactive(value: any): boolean {
  return reactiveToRaw.has(value) || readonlyToRaw.has(value)
}

// 判断是否是只读数据
export function isReadonly(value: any): boolean {
  return readonlyToRaw.has(value)
}

// 将可响应数据转化为原始数据
export function toRaw<T>(observed: T): T {
  return reactiveToRaw.get(observed) || readonlyToRaw.get(observed) || observed
}

// 标记该数据只读
export function markReadonly<T>(value: T): T {
  readonlyValues.add(value)
  return value
}

// 标记该数据不需要响应式的值
export function markNonReactive<T>(value: T): T {
  nonReactiveValues.add(value)
  return value
}
