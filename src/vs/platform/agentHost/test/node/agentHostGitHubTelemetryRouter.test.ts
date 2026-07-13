/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { GitHubTelemetryNotification } from '@github/copilot-sdk';
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentHostGitHubTelemetryRouter } from '../../node/agentHostGitHubTelemetryRouter.js';
import type { IAgentHostRestrictedTelemetry, TelemetryMeasurements, TelemetryProps } from '../../node/agentHostRestrictedTelemetry.js';

interface ICapturedEvent {
	readonly destination: 'enhancedGH' | 'internalMSFT';
	readonly eventName: string;
	readonly properties: TelemetryProps | undefined;
	readonly measurements: TelemetryMeasurements | undefined;
}

class TestRestrictedTelemetry implements IAgentHostRestrictedTelemetry {
	readonly events: ICapturedEvent[] = [];

	sendGHTelemetryEvent(): void { }
	sendEnhancedGHTelemetryEvent(eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void {
		this.events.push({ destination: 'enhancedGH', eventName, properties, measurements });
	}
	sendInternalMSFTTelemetryEvent(eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void {
		this.events.push({ destination: 'internalMSFT', eventName, properties, measurements });
	}
	setCopilotTrackingId(): void { }
	setRestrictedTelemetryEndpoint(): void { }
	setRestrictedTelemetryEnabled(): void { }
	setInternalTelemetryContext(): void { }
}

function notification(kind: string, restricted = true): GitHubTelemetryNotification {
	return {
		sessionId: 'session-1',
		restricted,
		event: {
			kind,
			model_call_id: 'model-call-1',
			properties: { existing: 'value' },
			metrics: { count: 2 },
		},
	};
}

suite('AgentHostGitHubTelemetryRouter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('routes the explicit restricted target allowlist to the exact sinks', () => {
		const telemetry = new TestRestrictedTelemetry();
		const router = new AgentHostGitHubTelemetryRouter(telemetry);

		const handled = [
			'engine.messages',
			'engine.messages.length',
			'model.message.added',
			'model.modelCall.input',
			'model.modelCall.output',
			'model.request.added',
			'model.request.options.added',
		].map(kind => router.route(notification(kind)));

		assert.deepStrictEqual({
			handled,
			events: telemetry.events.map(({ destination, eventName }) => ({ destination, eventName })),
		}, {
			handled: [true, true, true, true, true, true, true],
			events: [
				{ destination: 'enhancedGH', eventName: 'engine.messages' },
				{ destination: 'enhancedGH', eventName: 'engine.messages.length' },
				{ destination: 'internalMSFT', eventName: 'engine.messages.length' },
				{ destination: 'internalMSFT', eventName: 'model.message.added' },
				{ destination: 'internalMSFT', eventName: 'model.modelCall.input' },
				{ destination: 'internalMSFT', eventName: 'model.modelCall.output' },
				{ destination: 'internalMSFT', eventName: 'model.request.added' },
				{ destination: 'internalMSFT', eventName: 'model.request.options.added' },
			],
		});
	});

	test('ignores unknown and standard target events', () => {
		const telemetry = new TestRestrictedTelemetry();
		const router = new AgentHostGitHubTelemetryRouter(telemetry);

		const unknownHandled = router.route(notification('unknown'));
		const standardHandled = router.route(notification('engine.messages', false));

		assert.deepStrictEqual({ unknownHandled, standardHandled, events: telemetry.events }, {
			unknownHandled: false,
			standardHandled: false,
			events: [],
		});
	});

	test('forwards properties and metrics and maps model_call_id without overwriting modelCallId', () => {
		const telemetry = new TestRestrictedTelemetry();
		const router = new AgentHostGitHubTelemetryRouter(telemetry);

		router.route(notification('engine.messages'));
		const existingModelCallId = notification('engine.messages');
		existingModelCallId.event.properties.modelCallId = 'existing-model-call';
		router.route(existingModelCallId);

		assert.deepStrictEqual(telemetry.events, [
			{
				destination: 'enhancedGH',
				eventName: 'engine.messages',
				properties: { existing: 'value', modelCallId: 'model-call-1' },
				measurements: { count: 2 },
			},
			{
				destination: 'enhancedGH',
				eventName: 'engine.messages',
				properties: { existing: 'value', modelCallId: 'existing-model-call' },
				measurements: { count: 2 },
			},
		]);
	});

});
