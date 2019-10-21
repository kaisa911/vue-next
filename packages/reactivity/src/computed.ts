import { effect, ReactiveEffect, activeReactiveEffectStack } from './effect'
import { Ref, refSymbol, UnwrapRef } from './ref'
import { isFunction, NOOP } from '@vue/shared'

export interface ComputedRef<T> extends WritableComputedRef<T> {
  readonly value: UnwrapRef<T>
}

export interface WritableComputedRef<T> extends Ref<T> {
  readonly effect: ReactiveEffect<T>
}

export interface WritableComputedOptions<T> {
  get: () => T
  set: (v: T) => void
}

// 计算属性
export function computed<T>(getter: () => T): ComputedRef<T>
export function computed<T>(
  options: WritableComputedOptions<T>
): WritableComputedRef<T>
export function computed<T>(
  getterOrOptions: (() => T) | WritableComputedOptions<T>
): any {
  const isReadonly = isFunction(getterOrOptions) // 是函数的话，就是readonly
  const getter = isReadonly
    ? (getterOrOptions as (() => T))
    : (getterOrOptions as WritableComputedOptions<T>).get
  const setter = isReadonly
    ? __DEV__
      ? () => {
          console.warn('Write operation failed: computed value is readonly')
        }
      : NOOP
    : (getterOrOptions as WritableComputedOptions<T>).set
  // 默认标记为 dirty，这样在第一次getter的时候，就会计算
  let dirty = true
  let value: T
  // 创建一个effect,返回一个包装后的getter方法
  const runner = effect(getter, {
    // 标记为lazy，不立即执行
    lazy: true,
    // 标记computed 在 trigger阶段有更高的优先级
    computed: true,
    scheduler: () => {
      // 标记为dirty，取值时会重新计算
      dirty = true
    }
  })
  // 返回一个对象
  return {
    // 标记为 ref 类型
    [refSymbol]: true,
    // 导出 effect 之后，可以用停止 computed
    effect: runner,
    get value() {
      // 如果dirty，那就重新取值，并把dirty设置为false
      if (dirty) {
        value = runner()
        dirty = false
      }
      // 当 computed effects 被parent effect 访问时，
      // parent effect 应该追踪计算属性追踪的所有的依赖项
      // 这也应适用于链接的计算属性。
      trackChildRun(runner)
      return value
    },
    set value(newValue: T) {
      // 调用自定义的setter
      setter(newValue)
    }
  }
}

// 追踪依赖项
function trackChildRun(childRunner: ReactiveEffect) {
  const parentRunner =
    activeReactiveEffectStack[activeReactiveEffectStack.length - 1]
  // 如果parentRunner 在栈里，那就把childRunner里的依赖，都放进parentRunner里
  if (parentRunner) {
    for (let i = 0; i < childRunner.deps.length; i++) {
      const dep = childRunner.deps[i]
      if (!dep.has(parentRunner)) {
        dep.add(parentRunner)
        parentRunner.deps.push(dep)
      }
    }
  }
}
