/*
  Ref 数据类型
  通过创建一个对象，也即是Ref数据，
  将原始数据（基本类型）保存在Ref的属性value当中，
  再将它的引用返回给使用者。
*/

import { track, trigger } from './effect'
import { OperationTypes } from './operations'
import { isObject } from '@vue/shared'
import { reactive } from './reactive'
import { ComputedRef } from './computed'

// 生成一个唯一key，开发环境下增加描述符 'refSymbol'
export const refSymbol = Symbol(__DEV__ ? 'refSymbol' : '')

// 定义 ref 接口，包含 _isRef 用于表示是否为 ref,
// value 用于承载真实的值 例如，ref(0)，value 就是 0
export interface Ref<T = any> {
  // 用此唯一key，来做Ref接口的一个描述符，让isRef函数做类型判断
  [refSymbol]: true
  // value值，存放真正的数据的地方。
  value: UnwrapRef<T>
}

// 如果传递的值是个对象(包含数组/Map/Set/WeakMap/WeakSet)，则使用reactive执行，否则返回原数据
// reactive是将数据转成响应式数据
const convert = (val: any): any => (isObject(val) ? reactive(val) : val)

// 返回一个 Ref 类型
export function ref<T extends Ref>(raw: T): T
export function ref<T>(raw: T): Ref<T>
export function ref(raw: any) {
  // 如果数据是ref类型，直接返回
  if (isRef(raw)) {
    return raw
  }
  // 转换成ref
  raw = convert(raw)
  // 生成一个包装后的值
  const v = {
    [refSymbol]: true,
    get value() {
      // 追踪 getter 操作，用于收集依赖等
      track(v, OperationTypes.GET, '')
      return raw
    },
    set value(newVal) {
      // 设置新值时也需要尝试转换， let a = ref(0);  a.value = 1
      raw = convert(newVal)
      // 触发 setter 操作
      trigger(v, OperationTypes.SET, '')
    }
  }
  return v as Ref
}
// 判断是否是ref
export function isRef(v: any): v is Ref {
  return v ? v[refSymbol] === true : false
}

// 把一个数据转换成 Ref 类型
export function toRefs<T extends object>(
  object: T
): { [K in keyof T]: Ref<T[K]> } {
  const ret: any = {}
  // 浅拷贝一下数据
  // 遍历对象的所有key，将其值转化为Ref数据
  for (const key in object) {
    ret[key] = toProxyRef(object, key)
  }
  return ret
}

// 某个属性代理成 Ref
function toProxyRef<T extends object, K extends keyof T>(
  object: T,
  key: K
): Ref<T[K]> {
  // 返回一个Ref类型数据，但是不是响应式的
  return {
    [refSymbol]: true,
    get value(): any {
      return object[key]
    },
    set value(newVal) {
      object[key] = newVal
    }
  }
}

// 当值的类型为以下几种，将直接使用，值为 Object 或者 Array 继续递归
type BailTypes =
  | Function
  | Map<any, any>
  | Set<any>
  | WeakMap<any, any>
  | WeakSet<any>

// Recursively unwraps nested value bindings.
// 递归地获取嵌套数据的类型
export type UnwrapRef<T> = {
  // 如果是cRef类型，继续解套
  cRef: T extends ComputedRef<infer V> ? UnwrapRef<V> : T
  // 如果是Ref类型，继续解套
  ref: T extends Ref<infer V> ? UnwrapRef<V> : T
  // 如果是数组，循环解套
  array: T extends Array<infer V> ? Array<UnwrapRef<V>> : T
  // 如果是对象，遍历解套
  object: { [K in keyof T]: UnwrapRef<T[K]> }
  // 否则，停止解套
  stop: T
}[T extends ComputedRef<any>
  ? 'cRef'
  : T extends Ref
    ? 'ref'
    : T extends Array<any>
      ? 'array'
      : T extends BailTypes
        ? 'stop' // bail out on types that shouldn't be unwrapped
        : T extends object ? 'object' : 'stop']
