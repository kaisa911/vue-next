import { track, trigger } from './effect'
import { OperationTypes } from './operations'
import { isObject } from '@vue/shared'
import { reactive } from './reactive'
import { ComputedRef } from './computed'

// 开发环境 refSymbol
export const refSymbol = Symbol(__DEV__ ? 'refSymbol' : '')

// 定义 ref 接口，包含 _isRef 用于表示是否为 ref,
// value 用于承载真实的值 例如，ref(0)，value 就是 0
export interface Ref<T = any> {
  [refSymbol]: true
  value: UnwrapRef<T>
}

// 转换方法，如果是对象就直接转成响应式的值， 否则直接使用
const convert = (val: any): any => (isObject(val) ? reactive(val) : val)

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

// 把一个数据转换成refs
export function toRefs<T extends object>(
  object: T
): { [K in keyof T]: Ref<T[K]> } {
  const ret: any = {}
  // 浅拷贝一下数据
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

// 递归的解开值， TS 没有能实现这种的递归操作， 所以手动写了 4 层大概来满足业务要求
// 划重点！！！ 只是类型推导， 不影响实际的运行。
// Recursively unwraps nested value bindings.
export type UnwrapRef<T> = {
  cRef: T extends ComputedRef<infer V> ? UnwrapRef<V> : T
  ref: T extends Ref<infer V> ? UnwrapRef<V> : T
  array: T extends Array<infer V> ? Array<UnwrapRef<V>> : T
  object: { [K in keyof T]: UnwrapRef<T[K]> }
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
