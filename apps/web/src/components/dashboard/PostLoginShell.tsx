import React from 'react';
import { Container, SectionHeading } from '../ui/layout';

interface PostLoginShellProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  maxWidth?: string;
  children: React.ReactNode;
}

export const PostLoginShell: React.FC<PostLoginShellProps> = ({
  title,
  subtitle,
  actions,
  maxWidth,
  children
}) => {
  return (
    <div className="flex-1 bg-background">
      <Container className={`${maxWidth || 'max-w-7xl'} py-6 lg:py-8 space-y-6`}>
        <SectionHeading as="h1" title={title} description={subtitle} actions={actions} />
        {children}
      </Container>
    </div>
  );
};
