// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * [[ClientMetricReport]] gets the media metrics used by ConnectionMonitor to
 * update connection health data.
 */
export default interface ClientMetricReport {
  /**
   * Gets raw client media metrics
   */
  getObservableMetrics(): { [id: string]: number };

  /**
   * Gets video client media metrics
   */
  getObservableVideoMetrics?(): { [id: string]: { [id: string]: {} } };

  /**
   * Gets raw RTCStatsReport from `RTCPeerConnection.getStats()` API
   */
  getRTCStatsReport?(): RTCStatsReport;
}
