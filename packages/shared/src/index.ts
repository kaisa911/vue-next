export * from './patchFlags'
export * from './element'
export { globalsWhitelist } from './globalsWhitelist'

export const EMPTY_OBJ: { readonly [key: string]: any } = __DEV__
  ? Object.freeze({})
  : {} // 空对象
export const EMPTY_ARR: [] = [] // 空数组

export const NOOP = () => {} // 空对象

/**
 * 该函数一直返回false.
 */
export const NO = () => false
// 判断字符串是否是 'on'
export const isOn = (key: string) => key[0] === 'o' && key[1] === 'n'

// 一个拷贝的方法，使a拷贝b的所有属性
export const extend = <T extends object, U extends object>(
  a: T,
  b: U
): T & U => {
  for (const key in b) {
    ;(a as any)[key] = b[key]
  }
  return a as any
}
// 指示对象自身属性中是否具有指定的属性
const hasOwnProperty = Object.prototype.hasOwnProperty
//封装一下上面的方法
export const hasOwn = (
  val: object,
  key: string | symbol
): key is keyof typeof val => hasOwnProperty.call(val, key)

export const isArray = Array.isArray // 判断是否是数组
export const isFunction = (val: any): val is Function =>
  typeof val === 'function' // 判断是否是函数
export const isString = (val: any): val is string => typeof val === 'string'
export const isSymbol = (val: any): val is symbol => typeof val === 'symbol'
export const isObject = (val: any): val is Record<any, any> =>
  val !== null && typeof val === 'object'

export const objectToString = Object.prototype.toString // 判断类型
export const toTypeString = (value: unknown): string =>
  objectToString.call(value)

export const isPlainObject = (val: any): val is object =>
  toTypeString(val) === '[object Object]' // 简单对象

const vnodeHooksRE = /^vnode/ // 以vnode开头的正则

// 是否是已预留的prop，包含key,ref,$once 或者以vnode开头的
export const isReservedProp = (key: string): boolean =>
  key === 'key' || key === 'ref' || key === '$once' || vnodeHooksRE.test(key)

const camelizeRE = /-(\w)/g // 判断是负的数字的字符串
export const camelize = (str: string): string => {
  return str.replace(camelizeRE, (_, c) => (c ? c.toUpperCase() : ''))
}

const hyphenateRE = /\B([A-Z])/g // 边界的字母的正则
// 连字符的第一个字母之后加上改成'-',然后转成小写
export const hyphenate = (str: string): string => {
  return str.replace(hyphenateRE, '-$1').toLowerCase()
}
// 把第一个字母变成大写
export const capitalize = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1)
}
