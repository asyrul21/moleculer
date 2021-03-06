/*
 * moleculer
 * Copyright (c) 2017 Ice Services (https://github.com/ice-services/moleculer)
 * MIT Licensed
 */

"use strict";

const { CIRCUIT_CLOSE, CIRCUIT_HALF_OPEN, CIRCUIT_OPEN } = require("../constants");
const { RequestTimeoutError } = require("../errors");

const ActionEndpoint = require("./endpoint-action");

/**
 * Action endpoint, which protected with circuit breaker logic
 *
 * @class ActionEndpointCB
 * @extends {ActionEndpoint}
 */
class ActionEndpointCB extends ActionEndpoint {

	/**
	 * Creates an instance of ActionEndpointCB.
	 * @param {Registry} registry
	 * @param {ServiceBroker} broker
	 * @param {Node} node
	 * @param {ServiceItem} service
	 * @param {any} action
	 * @memberof ActionEndpointCB
	 */
	constructor(registry, broker, node, service, action) {
		super(registry, broker, node, service, action);

		this.opts = this.registry.opts.circuitBreaker;

		this.state = CIRCUIT_CLOSE;
		this.failures = 0;

		this.cbTimer = null;
	}

	/**
	 * Get availability
	 *
	 * @readonly
	 * @memberof ActionEndpointCB
	 */
	get isAvailable() {
		return this.state === CIRCUIT_CLOSE || this.state === CIRCUIT_HALF_OPEN;
	}

	/**
	 * Increment failure counter
	 *
	 * @memberof ActionEndpointCB
	 */
	failure(err) {
		if (err) {
			if (err instanceof RequestTimeoutError) {
				if (this.opts.failureOnTimeout)
					this.failures++;

			} else if (err.code >= 500 && this.opts.failureOnReject) {
				this.failures++;
			}

			if (this.failures >= this.opts.maxFailures) {
				this.circuitOpen();
			}
		}
	}

	/**
	 *
	 *
	 * @memberof ActionEndpointCB
	 */
	success() {
		if (this.state === CIRCUIT_HALF_OPEN)
			this.circuitClose();
	}

	/**
	 * Change circuit-breaker status to open
	 *
	 * @memberof ActionEndpointCB
	 */
	circuitOpen() {
		this.state = CIRCUIT_OPEN;
		this.cbTimer = setTimeout(() => {
			this.circuitHalfOpen();
		}, this.opts.halfOpenTime);

		this.cbTimer.unref();

		this.broker.broadcastLocal("$circuit-breaker.opened", { node: this.node, action: this.action, failures: this.failures });

		if (this.broker.options.metrics)
			this.broker.emit("metrics.circuit-breaker.opened", { nodeID: this.node.id, action: this.action.name, failures: this.failures });
	}

	/**
	 * Change circuit-breaker status to half-open
	 *
	 * @memberof ActionEndpointCB
	 */
	circuitHalfOpen() {
		this.state = CIRCUIT_HALF_OPEN;

		this.broker.broadcastLocal("$circuit-breaker.half-opened", { node: this.node, action: this.action });
		if (this.broker.options.metrics)
			this.broker.emit("metrics.circuit-breaker.half-opened", { nodeID: this.node.id, action: this.action.name });
	}

	/**
	 * Change circuit-breaker status to close
	 *
	 * @memberof ActionEndpointCB
	 */
	circuitClose() {
		this.state = CIRCUIT_CLOSE;
		this.failures = 0;
		this.broker.broadcastLocal("$circuit-breaker.closed", { node: this.node, action: this.action });
		if (this.broker.options.metrics)
			this.broker.emit("metrics.circuit-breaker.closed", { nodeID: this.node.id, action: this.action.name });

	}
}

module.exports = ActionEndpointCB;
