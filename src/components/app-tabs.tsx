import { NativeTabs } from 'expo-router/unstable-native-tabs';

export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor="#000000"
      indicatorColor="#1A1A1E"
      labelStyle={{ selected: { color: '#00D2FF' }, default: { color: '#8E8E93' } }}
    >
      <NativeTabs.Trigger name="index"><NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label></NativeTabs.Trigger>
      <NativeTabs.Trigger name="strain"><NativeTabs.Trigger.Label>Run</NativeTabs.Trigger.Label></NativeTabs.Trigger>
      <NativeTabs.Trigger name="sleep"><NativeTabs.Trigger.Label>Sleep</NativeTabs.Trigger.Label></NativeTabs.Trigger>
      <NativeTabs.Trigger name="journal"><NativeTabs.Trigger.Label>Readiness</NativeTabs.Trigger.Label></NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings"><NativeTabs.Trigger.Label>You</NativeTabs.Trigger.Label></NativeTabs.Trigger>
    </NativeTabs>
  );
}
