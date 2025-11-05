/**
 * OpenTelemetry Trace Manager
 * Distributed tracing for multi-agent system
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import {
  Span,
  SpanKind,
  SpanStatusCode,
  trace,
  context,
  propagation,
  Context,
} from "@opentelemetry/api";
import { logger } from "./simple-logger.js";
import { TraceData } from "./types.js";

export class TraceManager {
  private sdk: NodeSDK;
  private tracer = trace.getTracer("pit-crew-observability");
  private activeSpans: Map<
    string,
    { span: Span; start: number; operationName: string; agentName: string }
  > = new Map();
  private serviceName: string;

  constructor(serviceName: string = "pit-crew-observability") {
    this.serviceName = serviceName;
    this.sdk = {} as NodeSDK; // Initialize with empty object, will be replaced in initializeOpenTelemetry
    this.initializeOpenTelemetry();
  }

  /**
   * Initialize OpenTelemetry SDK
   */
  private initializeOpenTelemetry(): void {
    try {
      const traceExporter = new OTLPTraceExporter({
        url:
          process.env.OTLP_TRACE_ENDPOINT || "http://localhost:4318/v1/traces",
      });

      this.sdk = new NodeSDK({
        resource: new Resource({
          [SemanticResourceAttributes.SERVICE_NAME]: this.serviceName,
          [SemanticResourceAttributes.SERVICE_VERSION]: "1.0.0",
          [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]:
            process.env.NODE_ENV || "development",
        }),
        traceExporter,
      });

      // Start the SDK (non-blocking for this version)
      try {
        // Some versions return void; call without awaiting
        (this.sdk.start as any)();
        logger.info("OpenTelemetry SDK started");
      } catch (e: any) {
        logger.error("Failed to start OpenTelemetry SDK", {
          error: e?.message || String(e),
        });
      }

      // Handle process termination
      process.on("SIGTERM", () => {
        (this.sdk.shutdown as any)();
        logger.info("OpenTelemetry SDK terminated");
      });
    } catch (error) {
      logger.error("Failed to initialize OpenTelemetry", {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Start a new trace span
   */
  startSpan(
    operationName: string,
    agentName: string,
    options: {
      kind?: SpanKind;
      parentSpanId?: string;
      attributes?: Record<string, any>;
    } = {},
  ): string {
    const spanId = `span-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const spanOptions = {
      kind: options.kind || SpanKind.INTERNAL,
      attributes: {
        "agent.name": agentName,
        "operation.name": operationName,
        "trace.timestamp": new Date().toISOString(),
        ...options.attributes,
      },
    };

    // Use context from parent span if provided
    const parentContext = options.parentSpanId
      ? this.getSpanContext(options.parentSpanId)
      : context.active();

    const span = this.tracer.startSpan(
      operationName,
      spanOptions as any,
      parentContext,
    );
    this.activeSpans.set(spanId, {
      span,
      start: Date.now(),
      operationName,
      agentName,
    });

    logger.debug("Started trace span", {
      span_id: spanId,
      operation_name: operationName,
      agent_name: agentName,
      parent_span_id: options.parentSpanId,
    });

    return spanId;
  }

  /**
   * End a trace span
   */
  endSpan(
    spanId: string,
    status: "success" | "error" | "timeout" = "success",
    error?: Error,
  ): void {
    const record = this.activeSpans.get(spanId);
    if (!record) {
      logger.warn("Attempted to end unknown span", { span_id: spanId });
      return;
    }
    const span = record.span;

    try {
      // Set span status
      switch (status) {
        case "success":
          span.setStatus({ code: SpanStatusCode.OK });
          break;
        case "error":
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error?.message || "Unknown error",
          });
          if (error) {
            span.recordException(error);
          }
          break;
        case "timeout":
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: "Operation timed out",
          });
          break;
      }

      // End the span
      span.end();

      // Calculate duration from stored metadata
      const duration = Date.now() - record.start;

      // Log trace completion
      logger.debug("Completed trace span", {
        span_id: spanId,
        operation_name: record.operationName,
        status,
        duration_ms: duration,
      });

      // Remove from active spans
      this.activeSpans.delete(spanId);
    } catch (error) {
      logger.error("Error ending trace span", {
        span_id: spanId,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Add attributes to a span
   */
  addSpanAttributes(spanId: string, attributes: Record<string, any>): void {
    const rec = this.activeSpans.get(spanId);
    if (!rec) {
      logger.warn("Attempted to add attributes to unknown span", {
        span_id: spanId,
      });
      return;
    }

    try {
      rec.span.setAttributes(attributes);
      logger.debug("Added span attributes", {
        span_id: spanId,
        attributes_count: Object.keys(attributes).length,
      });
    } catch (error) {
      logger.error("Error adding span attributes", {
        span_id: spanId,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Add an event to a span
   */
  addSpanEvent(
    spanId: string,
    eventName: string,
    attributes?: Record<string, any>,
  ): void {
    const rec2 = this.activeSpans.get(spanId);
    if (!rec2) {
      logger.warn("Attempted to add event to unknown span", {
        span_id: spanId,
      });
      return;
    }

    try {
      rec2.span.addEvent(eventName, attributes);
      logger.debug("Added span event", {
        span_id: spanId,
        event_name: eventName,
      });
    } catch (error) {
      logger.error("Error adding span event", {
        span_id: spanId,
        event_name: eventName,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Record exception on a span
   */
  recordSpanException(spanId: string, exception: Error): void {
    const rec3 = this.activeSpans.get(spanId);
    if (!rec3) {
      logger.warn("Attempted to record exception on unknown span", {
        span_id: spanId,
      });
      return;
    }

    try {
      rec3.span.recordException(exception);
      rec3.span.setStatus({
        code: SpanStatusCode.ERROR,
        message: exception.message,
      });
      logger.debug("Recorded span exception", {
        span_id: spanId,
        exception_type: exception.constructor.name,
        exception_message: exception.message,
      });
    } catch (error) {
      logger.error("Error recording span exception", {
        span_id: spanId,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Trace an agent operation with automatic span management
   */
  async traceOperation<T>(
    operationName: string,
    agentName: string,
    operation: (span: Span) => Promise<T>,
    options: {
      kind?: SpanKind;
      parentSpanId?: string;
      attributes?: Record<string, any>;
      timeoutMs?: number;
    } = {},
  ): Promise<T> {
    const spanOptions: {
      kind?: SpanKind;
      parentSpanId?: string;
      attributes: Record<string, any>;
    } = {
      attributes: {
        "agent.operation": operationName,
        "agent.name": agentName,
        "operation.timeout_ms": options.timeoutMs || 0,
        ...options.attributes,
      },
    };

    if (options.kind !== undefined) {
      spanOptions.kind = options.kind;
    }
    if (options.parentSpanId !== undefined) {
      spanOptions.parentSpanId = options.parentSpanId;
    }

    const spanId = this.startSpan(operationName, agentName, spanOptions);

    try {
      const span = this.activeSpans.get(spanId)!.span;

      // Execute operation with timeout if specified
      if (options.timeoutMs) {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(
              new Error(`Operation timed out after ${options.timeoutMs}ms`),
            );
          }, options.timeoutMs);
        });

        const result = await Promise.race([operation(span), timeoutPromise]);
        this.endSpan(spanId, "success");
        return result;
      } else {
        const result = await operation(span);
        this.endSpan(spanId, "success");
        return result;
      }
    } catch (error) {
      const isTimeout =
        error instanceof Error && error.message.includes("timed out");
      this.endSpan(spanId, isTimeout ? "timeout" : "error", error as Error);
      throw error;
    }
  }

  /**
   * Get span context for propagation
   */
  getSpanContext(spanId: string): Context | undefined {
    const rec = this.activeSpans.get(spanId);
    return rec ? trace.setSpan(context.active(), rec.span) : undefined;
  }

  /**
   * Extract span context from carrier
   */
  extractSpanContext(carrier: Record<string, string>): Context | undefined {
    try {
      return propagation.extract(context.active(), carrier);
    } catch (error) {
      logger.warn("Failed to extract span context", {
        error: (error as Error).message,
      });
      return undefined;
    }
  }

  /**
   * Inject span context into carrier
   */
  injectSpanContext(
    carrier: Record<string, string>,
    spanContext: Context,
  ): void {
    try {
      propagation.inject(spanContext, carrier);
    } catch (error) {
      logger.warn("Failed to inject span context", {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get active spans count
   */
  getActiveSpansCount(): number {
    return this.activeSpans.size;
  }

  /**
   * Get active spans information
   */
  getActiveSpans(): Array<{
    spanId: string;
    operationName: string;
    agentName: string;
    startTime: string;
  }> {
    return Array.from(this.activeSpans.entries()).map(([spanId, rec]) => ({
      spanId,
      operationName: rec.operationName,
      agentName: rec.agentName,
      startTime: new Date(rec.start).toISOString(),
    }));
  }

  /**
   * Trace system health check
   */
  async traceHealthCheck(
    componentName: string,
    healthCheck: () => Promise<{ status: string; details?: any }>,
  ): Promise<{ status: string; details?: any; traceData?: TraceData }> {
    return this.traceOperation(
      `health_check_${componentName}`,
      "observability-agent",
      async (span) => {
        span.setAttribute("component.name", componentName);
        span.setAttribute("health.check.type", "component");

        const startTime = Date.now();
        try {
          const result = await healthCheck();
          const duration = Date.now() - startTime;

          span.setAttribute("health.status", result.status);
          span.setAttribute("health.duration_ms", duration);
          if (result.details) {
            span.setAttributes(result.details);
          }

          return {
            ...result,
            traceData: {
              trace_id: span.spanContext().traceId,
              span_id: span.spanContext().spanId,
              operation_name: `health_check_${componentName}`,
              agent_name: "observability-agent",
              start_time: new Date(startTime).toISOString(),
              end_time: new Date().toISOString(),
              duration_ms: duration,
              status: result.status === "healthy" ? "success" : "error",
            },
          };
        } catch (error) {
          span.setAttribute("health.status", "error");
          span.recordException(error as Error);
          throw error;
        }
      },
    );
  }

  /**
   * Trace agent metrics collection
   */
  async traceMetricsCollection(
    agentName: string,
    metricsCollection: () => Promise<Record<string, number>>,
  ): Promise<{ metrics: Record<string, number>; traceData?: TraceData }> {
    return this.traceOperation(
      `metrics_collection_${agentName}`,
      "observability-agent",
      async (span) => {
        span.setAttribute("metrics.agent_name", agentName);
        span.setAttribute("metrics.collection_type", "agent");

        const startTime = Date.now();
        const metrics = await metricsCollection();
        const duration = Date.now() - startTime;

        // Add metrics as span attributes (but limit to avoid span bloat)
        const limitedMetrics = Object.fromEntries(
          Object.entries(metrics).slice(0, 10), // Limit to 10 attributes
        );
        span.setAttributes(limitedMetrics);
        span.setAttribute("metrics.total_count", Object.keys(metrics).length);
        span.setAttribute("metrics.collection_duration_ms", duration);

        return {
          metrics,
          traceData: {
            trace_id: span.spanContext().traceId,
            span_id: span.spanContext().spanId,
            operation_name: `metrics_collection_${agentName}`,
            agent_name: "observability-agent",
            start_time: new Date(startTime).toISOString(),
            end_time: new Date().toISOString(),
            duration_ms: duration,
            status: "success",
            attributes: limitedMetrics,
          },
        };
      },
    );
  }

  /**
   * Get tracer instance for manual span creation
   */
  getTracer() {
    return this.tracer;
  }

  /**
   * Shutdown the trace manager
   */
  async shutdown(): Promise<void> {
    try {
      // End all active spans
      for (const [, rec] of this.activeSpans) {
        rec.span.end();
      }
      this.activeSpans.clear();

      // Shutdown OpenTelemetry SDK
      await this.sdk.shutdown();
      logger.info("Trace manager shutdown completed");
    } catch (error) {
      logger.error("Error during trace manager shutdown", {
        error: (error as Error).message,
      });
    }
  }
}

export default TraceManager;
