// 操作类型，使用了枚举型
export const enum OperationTypes {
  // 使用字符串而不数字方便调试事件
  SET = 'set',
  ADD = 'add',
  DELETE = 'delete',
  CLEAR = 'clear',
  GET = 'get',
  HAS = 'has',
  ITERATE = 'iterate'
}
