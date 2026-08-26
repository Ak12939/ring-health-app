import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Path, LinearGradient, Stop, Defs } from 'react-native-svg';

interface ChartProps {
  data: number[];
  title: string;
  unit: string;
  color: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 64;
const CHART_HEIGHT = 120;

export const VitalsChart: React.FC<ChartProps> = ({ data, title, unit, color }) => {
  if (!data || data.length < 2) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.placeholder}>Collecting data points...</Text>
      </View>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  // Generate SVG path coordinates
  const points = data.map((val, index) => {
    const x = (index / (data.length - 1)) * CHART_WIDTH;
    const y = CHART_HEIGHT - ((val - min) / range) * (CHART_HEIGHT - 20) - 10;
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(' L ')}`;
  const latestValue = data[data.length - 1];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={[styles.latest, { color }]}>
          {latestValue} <Text style={styles.unit}>{unit}</Text>
        </Text>
      </View>

      <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
        <Defs>
          <LinearGradient id={`grad-${title}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <Stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </LinearGradient>
        </Defs>

        <Path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth="3"
        />
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  title: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '600',
  },
  latest: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  unit: {
    fontSize: 12,
    color: '#8E8E93',
  },
  placeholder: {
    color: '#636366',
    fontSize: 14,
    marginVertical: 20,
    textAlign: 'center',
  },
});