import type { Request, Response, NextFunction, RequestHandler } from 'express';

export type AsyncHandler<TReq extends Request = Request, TRes extends Response = Response> = (
  req: TReq,
  res: TRes,
  next: NextFunction
) => unknown | Promise<unknown>;

export function wrap<TReq extends Request = Request, TRes extends Response = Response>(
  handler: AsyncHandler<TReq, TRes>
): RequestHandler {
  const wrapped: RequestHandler = (req, res, next) => {
    let result: unknown;
    try {
      result = handler(req as TReq, res as TRes, next);
    } catch (err) {
      next(err);
      return;
    }

    if (result && typeof (result as Promise<unknown>).then === 'function') {
      (result as Promise<unknown>)
        .then(() => {
          if ((res as any).writableEnded || res.headersSent) next();
        })
        .catch(next);
      return;
    }

    if ((res as any).writableEnded || res.headersSent) next();
  };

  return wrapped;
}
