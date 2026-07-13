/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { GitHubTelemetryNotification } from '@github/copilot-sdk';
import type { IAgentHostRestrictedTelemetry, TelemetryProps } from './agentHostRestrictedTelemetry.js';

const enum TelemetryDestination {
	EnhancedGH = 1,
	InternalMSFT = 2,
}

const targetDestinations = new Map<string, TelemetryDestination>([
	['engine.messages', TelemetryDestination.EnhancedGH],
	['engine.messages.length', TelemetryDestination.EnhancedGH | TelemetryDestination.InternalMSFT],
	['model.message.added', TelemetryDestination.InternalMSFT],
	['model.modelCall.input', TelemetryDestination.InternalMSFT],
	['model.modelCall.output', TelemetryDestination.InternalMSFT],
	['model.request.added', TelemetryDestination.InternalMSFT],
	['model.request.options.added', TelemetryDestination.InternalMSFT],
]);

export class AgentHostGitHubTelemetryRouter {

	constructor(private readonly _telemetryService: IAgentHostRestrictedTelemetry) { }

	route(notification: GitHubTelemetryNotification): boolean {
		if (!notification.restricted) {
			return false;
		}

		const { event } = notification;
		const eventName = event.kind;
		const destinations = targetDestinations.get(eventName);
		if (destinations === undefined) {
			return false;
		}

		const properties: TelemetryProps = event.model_call_id && event.properties.modelCallId === undefined
			? { ...event.properties, modelCallId: event.model_call_id }
			: event.properties;
		if (destinations & TelemetryDestination.EnhancedGH) {
			this._telemetryService.sendEnhancedGHTelemetryEvent(eventName, properties, event.metrics);
		}
		if (destinations & TelemetryDestination.InternalMSFT) {
			this._telemetryService.sendInternalMSFTTelemetryEvent(eventName, properties, event.metrics);
		}
		return true;
	}
}
