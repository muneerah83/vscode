/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IRequestService } from '../../../request/common/request.js';
import { AgentHostInternalTelemetrySender } from '../../node/agentHostMicrosoftTelemetry.js';

class TestAppender {
	readonly events: { eventName: string; data: object | undefined }[] = [];
	flushCount = 0;

	log(eventName: string, data?: object): void {
		this.events.push({ eventName, data });
	}
	async flush(): Promise<void> {
		this.flushCount++;
	}
}

suite('AgentHostInternalTelemetrySender', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('creates and sends only for internal users with identity enrichment', () => {
		const appenders: TestAppender[] = [];
		const requestService = { _serviceBrand: undefined } as IRequestService;
		const sender = disposables.add(new AgentHostInternalTelemetrySender(requestService, actualRequestService => {
			assert.strictEqual(actualRequestService, requestService);
			const appender = new TestAppender();
			appenders.push(appender);
			return appender;
		}));

		sender.send('ignored');
		sender.setContext({ isInternal: false, trackingId: 'external-tid', userName: 'external', isVscodeTeamMember: false });
		sender.send('ignoredExternal');
		sender.setContext({ isInternal: true, trackingId: 'internal-tid', userName: 'octocat', isVscodeTeamMember: true });
		sender.send('engine.messages.length', { value: 'property' }, { count: 3 });

		assert.deepStrictEqual(appenders.map(appender => appender.events), [[{
			eventName: 'engine.messages.length',
			data: {
				value: 'property',
				'common.tid': 'internal-tid',
				'common.userName': 'octocat',
				count: 3,
				'common.isVscodeTeamMember': 1,
			},
		}]]);
	});

	test('flushes and disables the appender when internal identity is cleared or changed', () => {
		const appenders: TestAppender[] = [];
		const sender = disposables.add(new AgentHostInternalTelemetrySender(undefined, () => {
			const appender = new TestAppender();
			appenders.push(appender);
			return appender;
		}));

		sender.setContext({ isInternal: true, trackingId: 'tid-1', userName: 'first', isVscodeTeamMember: false });
		sender.setContext(undefined);
		sender.send('ignoredAfterClear');
		sender.setContext({ isInternal: true, trackingId: 'tid-2', userName: 'second', isVscodeTeamMember: false });

		assert.deepStrictEqual({
			appenderCount: appenders.length,
			firstFlushCount: appenders[0].flushCount,
			firstEvents: appenders[0].events,
		}, {
			appenderCount: 2,
			firstFlushCount: 1,
			firstEvents: [],
		});
	});
});