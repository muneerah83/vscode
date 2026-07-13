/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import type { IRequestService } from '../../request/common/request.js';
import { OneDataSystemAppender } from '../../telemetry/node/1dsAppender.js';
import type { IAgentHostInternalTelemetryContext, IAgentHostInternalTelemetrySink, TelemetryMeasurements, TelemetryProps } from './agentHostRestrictedTelemetry.js';

// Public instrumentation key shipped as internalLargeStorageAriaKey in extensions/copilot/package.json.
const INTERNAL_LARGE_STORAGE_ARIA_KEY = 'ec712b3202c5462fb6877acae7f1f9d7-c19ad55e-3e3c-4f99-984b-827f6d95bd9e-6917';
const INTERNAL_EVENT_PREFIX = 'GitHub.copilot.chat';

interface IInternalTelemetryAppender {
	log(eventName: string, data?: object): void;
	flush(): Promise<void>;
}

class InternalTelemetryAppender extends Disposable {

	constructor(readonly appender: IInternalTelemetryAppender) {
		super();
		this._register(toDisposable(() => { void appender.flush(); }));
	}
}

export class AgentHostInternalTelemetrySender extends Disposable implements IAgentHostInternalTelemetrySink {

	private readonly _appender = this._register(new MutableDisposable<InternalTelemetryAppender>());
	private _context: IAgentHostInternalTelemetryContext | undefined;

	constructor(
		private readonly _requestService?: IRequestService,
		private readonly _createAppender: (requestService: IRequestService | undefined) => IInternalTelemetryAppender = requestService => new OneDataSystemAppender(requestService, true, INTERNAL_EVENT_PREFIX, null, INTERNAL_LARGE_STORAGE_ARIA_KEY),
	) {
		super();
	}

	setContext(context: IAgentHostInternalTelemetryContext | undefined): void {
		this._context = context?.isInternal ? context : undefined;
		if (!this._context) {
			this._appender.clear();
			return;
		}
		this._appender.value ??= new InternalTelemetryAppender(this._createAppender(this._requestService));
	}

	send(eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void {
		if (!this._context || !this._appender.value) {
			return;
		}
		this._appender.value.appender.log(eventName, {
			...properties,
			'common.tid': this._context.trackingId,
			'common.userName': this._context.userName ?? 'undefined',
			...measurements,
			'common.isVscodeTeamMember': this._context.isVscodeTeamMember ? 1 : 0,
		});
	}
}