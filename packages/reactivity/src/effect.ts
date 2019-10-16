import { OperationTypes } from './operations'
import { Dep, targetMap } from './reactive'
import { EMPTY_OBJ, extend } from '@vue/shared'

export const effectSymbol = Symbol(__DEV__ ? 'effect' : void 0)

export interface ReactiveEffect<T = any> {
  (): T
  [effectSymbol]: true
  active: boolean
  raw: () => T
  deps: Array<Dep>
  computed?: boolean
  scheduler?: (run: Function) => void
  onTrack?: (event: DebuggerEvent) => void
  onTrigger?: (event: DebuggerEvent) => void
  onStop?: () => void
}

export interface ReactiveEffectOptions {
  lazy?: boolean
  computed?: boolean
  scheduler?: (run: Function) => void
  onTrack?: (event: DebuggerEvent) => void
  onTrigger?: (event: DebuggerEvent) => void
  onStop?: () => void
}

export interface DebuggerEvent {
  effect: ReactiveEffect
  target: any
  type: OperationTypes
  key: string | symbol | undefined
}

export const activeReactiveEffectStack: ReactiveEffect[] = [] // actice 的响应式effect栈

export const ITERATE_KEY = Symbol('iterate') // 可遍历的 key
// 判断是否 effect
export function isEffect(fn: any): fn is ReactiveEffect {
  return fn != null && fn[effectSymbol] === true
}
// 创建一个 effect
export function effect<T = any>(
  fn: () => T,
  options: ReactiveEffectOptions = EMPTY_OBJ
): ReactiveEffect<T> {
  // 如果 fn 是一个 effect 函数，那就让 fn 等于原始的 fn，避免冲突
  if (isEffect(fn)) {
    fn = fn.raw
  }
  // 创建一个响应式的effect
  const effect = createReactiveEffect(fn, options)
  // 如果没有标记懒运行，那就立即执行 effect 方法
  if (!options.lazy) {
    effect()
  }
  // 返回当前 effect 函数
  return effect
}

// 停止一个 effect
export function stop(effect: ReactiveEffect) {
  if (effect.active) {
    // 清除依赖
    cleanup(effect)
    // 如果有 onStop，就执行该方法
    if (effect.onStop) {
      effect.onStop()
    }
    // 将 effect 的 active 标记设为 false，
    // 执行时不再压入 acticeReactiveEffectStack 中，
    // 以后就是一个普通函数
    effect.active = false
  }
}

// 创建一个响应式的 effect
function createReactiveEffect<T = any>(
  fn: () => T,
  options: ReactiveEffectOptions
): ReactiveEffect<T> {
  const effect = function reactiveEffect(...args: any[]): any {
    return run(effect, fn, args)
  } as ReactiveEffect
  effect[effectSymbol] = true
  effect.active = true
  effect.raw = fn
  effect.scheduler = options.scheduler
  effect.onTrack = options.onTrack
  effect.onTrigger = options.onTrigger
  effect.onStop = options.onStop
  effect.computed = options.computed
  effect.deps = []
  return effect
}

// 运行 effect
function run(effect: ReactiveEffect, fn: Function, args: any[]): any {
  // 如果 active 是 false，说明是一个普通函数
  if (!effect.active) {
    return fn(...args)
  }
  if (activeReactiveEffectStack.indexOf(effect) === -1) {
    // 如果栈中没有这个effect，那就清除依赖中的自己
    cleanup(effect)
    try {
      // 然后把effect压入栈中
      activeReactiveEffectStack.push(effect)
      // 再次执行函数时，会重新收集依赖
      return fn(...args)
    } finally {
      // 最后还是要出栈
      activeReactiveEffectStack.pop()
    }
  }
}

// 清除依赖的中的自己
function cleanup(effect: ReactiveEffect) {
  const { deps } = effect
  if (deps.length) {
    for (let i = 0; i < deps.length; i++) {
      deps[i].delete(effect)
    }
    deps.length = 0
  }
}

// 应该追踪的标记
let shouldTrack = true
// 暂停追踪
export function pauseTracking() {
  shouldTrack = false
}
// 恢复追踪
export function resumeTracking() {
  shouldTrack = true
}
/*
  track追踪函数
*/
export function track(
  target: any, // 目标
  type: OperationTypes, // 操作
  key?: string | symbol // 属性
) {
  if (!shouldTrack) {
    return
  }
  // 取当前的 effect 栈的最后一个
  const effect = activeReactiveEffectStack[activeReactiveEffectStack.length - 1]
  // 如果有 effect
  if (effect) {
    // 如果type是ITERATE
    if (type === OperationTypes.ITERATE) {
      key = ITERATE_KEY
    }
    // 取得当前对象的所有属性的依赖表
    let depsMap = targetMap.get(target)
    // 如果没有，那就设一个空的map
    if (depsMap === void 0) {
      targetMap.set(target, (depsMap = new Map()))
    }
    // 找到当前key的依赖
    let dep = depsMap.get(key!)
    // 如果没有，那就设一个空的map
    if (dep === void 0) {
      depsMap.set(key!, (dep = new Set()))
    }
    // 如果当 effect 没有在依赖表里面
    if (!dep.has(effect)) {
      // 就把 effect 加入当前key的依赖表, 当对应的key 发生变化时，可以方便的找到相应的 effect
      dep.add(effect)
      // 反过来， effect 也需要知道依赖了谁。
      // 当重新执行 effect 的时候可以方便的找到 dep 里面的自己先移除掉，因为有可能就不再是依赖了。
      // 这样有一个好处 effect 不需要知道具体依赖的哪个属性。
      effect.deps.push(dep)
      if (__DEV__ && effect.onTrack) {
        // 开发模式下调用 onTrack 事件， 便于调试。
        effect.onTrack({
          effect,
          target,
          type,
          key
        })
      }
    }
  }
}

// 触发依赖
export function trigger(
  target: any,
  type: OperationTypes,
  key?: string | symbol,
  extraInfo?: any
) {
  // 获取 target 对象相应的依赖吧
  const depsMap = targetMap.get(target)
  if (depsMap === void 0) {
    // 如果没有就直接返回
    return
  }
  // 声明一个effect的集合，一个计算执行集合
  const effects = new Set<ReactiveEffect>()
  const computedRunners = new Set<ReactiveEffect>()
  if (type === OperationTypes.CLEAR) {
    // 当 集合被清除时，触发所有属性的 effect,  例如  let a = reactive(new Set(1, 2)); a.clear()
    depsMap.forEach(dep => {
      addRunners(effects, computedRunners, dep)
    })
  } else {
    // 收集某一个key 的 effect
    if (key !== void 0) {
      addRunners(effects, computedRunners, depsMap.get(key))
    }
    // 如果 ADD | DELETE 操作也应该要触发集合/数组的
    // length/ITERATE_KEY 的 effect， 所以得收集一波。
    if (type === OperationTypes.ADD || type === OperationTypes.DELETE) {
      const iterationKey = Array.isArray(target) ? 'length' : ITERATE_KEY
      addRunners(effects, computedRunners, depsMap.get(iterationKey))
    }
  }
  const run = (effect: ReactiveEffect) => {
    scheduleRun(effect, target, type, key, extraInfo)
  }
  // 重要！！！！ 必须先运行 computed 的 effect,
  // 运行正常的 effect 之前使 computed getter 失效
  // Important: computed effects must be run first so that computed getters
  // can be invalidated before any normal effects that depend on them are run.
  computedRunners.forEach(run)
  effects.forEach(run)
}

// 添加执行
function addRunners(
  effects: Set<ReactiveEffect>,
  computedRunners: Set<ReactiveEffect>,
  effectsToAdd: Set<ReactiveEffect> | undefined
) {
  if (effectsToAdd !== void 0) {
    effectsToAdd.forEach(effect => {
      // 判断是否为 computed 属性，否则是普通的 effect
      if (effect.computed) {
        computedRunners.add(effect)
      } else {
        effects.add(effect)
      }
    })
  }
}

// 处理 effect 执行
function scheduleRun(
  effect: ReactiveEffect,
  target: any,
  type: OperationTypes,
  key: string | symbol | undefined,
  extraInfo: any
) {
  // 开发模式下触发 onTrigger
  if (__DEV__ && effect.onTrigger) {
    effect.onTrigger(
      extend(
        {
          effect,
          target,
          key,
          type
        },
        extraInfo
      )
    )
  }
  if (effect.scheduler !== void 0) {
    effect.scheduler(effect)
  } else {
    effect()
  }
}
