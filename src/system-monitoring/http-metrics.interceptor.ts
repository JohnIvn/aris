import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsCollectorService } from './metrics-collector.service';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsCollectorService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = http.getResponse();
          const duration = Math.max(1, Date.now() - startTime);
          const statusCode = res?.statusCode || 200;
          this.metrics.record(req.method || 'GET', req.url || '/', statusCode, duration);
        },
        error: (err) => {
          const duration = Math.max(1, Date.now() - startTime);
          const statusCode = err?.status || err?.statusCode || 500;
          this.metrics.record(req.method || 'GET', req.url || '/', statusCode, duration);
        },
      }),
    );
  }
}

